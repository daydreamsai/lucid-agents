import {
  createMiddleware,
  type RequestServerOptions,
  type RequestServerResult,
} from '@tanstack/react-start';
import {
  x402ResourceServer,
  x402HTTPResourceServer,
  HTTPFacilitatorClient,
  type FacilitatorConfig,
  type PaywallConfig,
  type RoutesConfig,
  type HTTPAdapter,
  type HTTPProcessResult,
} from '@x402/core/server';
import type { SIWxStorage } from '@lucid-agents/payments';
import type { SIWxConfig, AgentAuthContext } from '@lucid-agents/types/siwx';
import {
  parseSIWxHeader,
  verifySIWxPayload,
  buildSIWxExtensionDeclaration,
  entrypointHasSIWx,
} from '@lucid-agents/payments';
import type { EntrypointDef } from '@lucid-agents/types/core';

type RoutesConfigResolver =
  | RoutesConfig
  | (() => RoutesConfig | Promise<RoutesConfig>);

type AnyRequestServerOptions = RequestServerOptions<any, any>;
type AnyRequestServerResult = RequestServerResult<any, any, any>;

export type SIWxMiddlewareConfig = {
  siwxStorage?: SIWxStorage;
  siwxConfig?: SIWxConfig;
  entrypoints?: EntrypointDef[];
  basePath?: string;
};

class TanStackAdapter implements HTTPAdapter {
  private request: Request;
  private _pathname: string;

  constructor(request: Request, pathname: string) {
    this.request = request;
    this._pathname = pathname;
  }

  getHeader(name: string): string | undefined {
    return this.request.headers.get(name) ?? undefined;
  }

  getMethod(): string {
    return this.request.method.toUpperCase();
  }

  getPath(): string {
    return this._pathname;
  }

  getUrl(): string {
    return this.request.url;
  }

  getAcceptHeader(): string {
    return this.request.headers.get('Accept') ?? '';
  }

  getUserAgent(): string {
    return this.request.headers.get('User-Agent') ?? '';
  }

  getQueryParams(): Record<string, string | string[]> {
    const url = new URL(this.request.url);
    const params: Record<string, string | string[]> = {};
    for (const [key, value] of url.searchParams.entries()) {
      const existing = params[key];
      if (existing) {
        params[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
      } else {
        params[key] = value;
      }
    }
    return params;
  }

  getQueryParam(name: string): string | string[] | undefined {
    const url = new URL(this.request.url);
    const values = url.searchParams.getAll(name);
    if (values.length === 0) return undefined;
    if (values.length === 1) return values[0];
    return values;
  }
}

/**
 * Resolve the entrypoint key from a request pathname.
 * Expected format: {basePath}/entrypoints/{key}/{invoke|stream}
 */
function resolveEntrypointFromPath(
  pathname: string,
  entrypoints: EntrypointDef[],
  basePath: string
): EntrypointDef | undefined {
  const prefix = `${basePath}/entrypoints/`;
  if (!pathname.startsWith(prefix)) return undefined;
  const rest = pathname.slice(prefix.length);
  const slashIdx = rest.indexOf('/');
  const key = slashIdx >= 0 ? rest.slice(0, slashIdx) : rest;
  return entrypoints.find((ep) => ep.key === key);
}

/**
 * Try to verify a SIWX header against storage and return auth context if valid.
 */
async function trySIWxVerification(
  request: Request,
  siwxStorage: SIWxStorage,
  siwxConfig: SIWxConfig,
  entrypoint: EntrypointDef,
  resourceUri: string
): Promise<{ auth: AgentAuthContext } | { error: string } | null> {
  const siwxHeader =
    request.headers.get('SIGN-IN-WITH-X') ??
    request.headers.get('X-SIGN-IN-WITH-X');

  if (!siwxHeader) return null;

  const payload = parseSIWxHeader(siwxHeader);
  if (!payload) {
    return { error: 'invalid_siwx_header' };
  }

  const url = new URL(request.url);
  const domain = url.hostname;

  const isAuthOnly = entrypoint.siwx?.authOnly === true;

  const verifyResult = await verifySIWxPayload(payload, {
    storage: siwxStorage,
    resourceUri,
    domain,
    requireEntitlement: !isAuthOnly,
  });

  if (!verifyResult.success) {
    return { error: verifyResult.error ?? 'siwx_verification_failed' };
  }

  return {
    auth: {
      scheme: 'siwx',
      address: verifyResult.address!,
      chainId: verifyResult.chainId!,
      grantedBy: verifyResult.grantedBy!,
      payload: payload as unknown as Record<string, unknown>,
    },
  };
}

function createPaymentHandler(
  httpServer: x402HTTPResourceServer,
  paywallConfig?: PaywallConfig,
  siwxCfg?: SIWxMiddlewareConfig
) {
  return async function handleRequest(
    options: AnyRequestServerOptions
  ): Promise<AnyRequestServerResult> {
    const { request, pathname, context, next } = options;

    const respond = (response: Response): AnyRequestServerResult => ({
      request,
      pathname,
      context,
      response,
    });

    // --- SIWX pre-payment check ---
    if (siwxCfg?.siwxStorage && siwxCfg?.siwxConfig?.enabled && siwxCfg.entrypoints) {
      const basePath = siwxCfg.basePath ?? '/api/agent';
      const entrypoint = resolveEntrypointFromPath(pathname, siwxCfg.entrypoints, basePath);

      if (entrypoint && entrypointHasSIWx(entrypoint, siwxCfg.siwxConfig)) {
        const resourceUri = new URL(pathname, request.url).href;

        const siwxResult = await trySIWxVerification(
          request,
          siwxCfg.siwxStorage,
          siwxCfg.siwxConfig,
          entrypoint,
          resourceUri
        );

        if (siwxResult && 'auth' in siwxResult) {
          // SIWX verified - bypass payment, pass through with auth context
          const nextResult = await next();
          const enriched = new Response(nextResult.response.body, nextResult.response);
          enriched.headers.set('X-SIWX-Granted-By', siwxResult.auth.grantedBy);
          enriched.headers.set('X-SIWX-Address', siwxResult.auth.address);
          return {
            ...nextResult,
            response: enriched,
            context: {
              ...context,
              siwxAuth: siwxResult.auth,
            },
          };
        }

        // If SIWX header was present but invalid on auth-only route, reject
        if (siwxResult && 'error' in siwxResult && entrypoint.siwx?.authOnly) {
          return respond(
            new Response(
              JSON.stringify({
                error: {
                  code: 'siwx_auth_failed',
                  message: siwxResult.error,
                },
              }),
              {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          );
        }

        // Auth-only route with no SIWX header => reject with 401
        if (entrypoint.siwx?.authOnly && !siwxResult) {
          const url = new URL(request.url);
          const declaration = buildSIWxExtensionDeclaration({
            resourceUri,
            domain: url.hostname,
            statement:
              entrypoint.siwx?.statement ?? siwxCfg.siwxConfig.defaultStatement,
            chainId: entrypoint.siwx?.network ?? entrypoint.network,
            expirationSeconds: siwxCfg.siwxConfig.expirationSeconds,
          });

          return respond(
            new Response(
              JSON.stringify({
                error: {
                  code: 'siwx_required',
                  message: 'Wallet authentication required',
                  siwx: declaration,
                },
              }),
              {
                status: 401,
                headers: {
                  'Content-Type': 'application/json',
                  'X-SIWX-EXTENSION': Buffer.from(
                    JSON.stringify(declaration)
                  ).toString('base64'),
                },
              }
            )
          );
        }
      }
    }

    const adapter = new TanStackAdapter(request, pathname);
    const httpContext = {
      adapter,
      path: pathname,
      method: request.method.toUpperCase(),
      paymentHeader: adapter.getHeader('PAYMENT') ?? adapter.getHeader('X-PAYMENT'),
    };

    const result: HTTPProcessResult = await httpServer.processHTTPRequest(httpContext, paywallConfig);

    if (result.type === 'no-payment-required') {
      return next();
    }

    if (result.type === 'payment-error') {
      const { status, headers, body, isHtml } = result.response;
      const responseHeaders = new Headers(headers);

      // If 402 and SIWX is enabled, append SIWX extension declaration
      if (
        status === 402 &&
        siwxCfg?.siwxStorage &&
        siwxCfg?.siwxConfig?.enabled &&
        siwxCfg.entrypoints
      ) {
        const basePath = siwxCfg.basePath ?? '/api/agent';
        const entrypoint = resolveEntrypointFromPath(pathname, siwxCfg.entrypoints, basePath);
        if (entrypoint && entrypointHasSIWx(entrypoint, siwxCfg.siwxConfig)) {
          const resourceUri = new URL(pathname, request.url).href;
          const url = new URL(request.url);
          const declaration = buildSIWxExtensionDeclaration({
            resourceUri,
            domain: url.hostname,
            statement:
              entrypoint.siwx?.statement ?? siwxCfg.siwxConfig.defaultStatement,
            chainId: entrypoint.siwx?.network ?? entrypoint.network,
            expirationSeconds: siwxCfg.siwxConfig.expirationSeconds,
          });
          responseHeaders.set(
            'X-SIWX-EXTENSION',
            Buffer.from(JSON.stringify(declaration)).toString('base64')
          );
        }
      }

      if (isHtml) {
        responseHeaders.set('Content-Type', 'text/html');
        return respond(new Response(body as string, { status, headers: responseHeaders }));
      }
      responseHeaders.set('Content-Type', 'application/json');
      return respond(new Response(JSON.stringify(body), { status, headers: responseHeaders }));
    }

    const { paymentPayload, paymentRequirements } = result;

    const nextResult = await next();

    if (nextResult.response.status >= 400) {
      return nextResult;
    }

    const settlementResult = await httpServer.processSettlement(paymentPayload, paymentRequirements);

    if (settlementResult.success) {
      const enriched = new Response(nextResult.response.body, nextResult.response);
      for (const [key, value] of Object.entries(settlementResult.headers)) {
        enriched.headers.set(key, value);
      }

      // --- Post-settlement entitlement recording ---
      if (
        siwxCfg?.siwxStorage &&
        siwxCfg?.siwxConfig?.enabled &&
        siwxCfg.entrypoints
      ) {
        const basePath = siwxCfg.basePath ?? '/api/agent';
        const entrypoint = resolveEntrypointFromPath(pathname, siwxCfg.entrypoints, basePath);
        if (entrypoint && entrypointHasSIWx(entrypoint, siwxCfg.siwxConfig)) {
          const resourceUri = new URL(pathname, request.url).href;
          const payerAddress =
            typeof paymentPayload === 'object' && paymentPayload !== null
              ? (paymentPayload as Record<string, unknown>).from ??
                (paymentPayload as Record<string, unknown>).payer
              : undefined;

          if (typeof payerAddress === 'string' && payerAddress) {
            try {
              const chainId =
                entrypoint.siwx?.network ??
                entrypoint.network ??
                undefined;
              await siwxCfg.siwxStorage.recordPayment(
                resourceUri,
                payerAddress.toLowerCase(),
                chainId
              );
            } catch {
              // Entitlement recording failure should not block the response
            }
          }
        }
      }

      return {
        ...nextResult,
        response: enriched,
      };
    }

    return respond(
      new Response(
        JSON.stringify({
          x402Version: 2,
          error: settlementResult.errorReason ?? 'Settlement failed',
        }),
        {
          status: 402,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
  };
}

export function paymentMiddleware(
  routes: RoutesConfigResolver,
  facilitator?: FacilitatorConfig,
  paywall?: PaywallConfig,
  siwx?: SIWxMiddlewareConfig
) {
  let resolvedRoutes: RoutesConfig | null = null;
  let routesPromise: Promise<RoutesConfig> | null = null;

  if (typeof routes !== 'function') {
    resolvedRoutes = routes;
  }

  const facilitatorClient = new HTTPFacilitatorClient(facilitator);
  const resourceServer = new x402ResourceServer(facilitatorClient);

  let httpServer: x402HTTPResourceServer | null = null;
  let initPromise: Promise<void> | null = null;

  async function getHttpServer(): Promise<x402HTTPResourceServer> {
    if (httpServer) return httpServer;

    if (!initPromise) {
      initPromise = (async () => {
        if (!resolvedRoutes) {
          if (!routesPromise && typeof routes === 'function') {
            routesPromise = Promise.resolve(routes());
          }
          resolvedRoutes = await routesPromise!;
        }

        await resourceServer.initialize();

        httpServer = new x402HTTPResourceServer(resourceServer, resolvedRoutes);
        await httpServer.initialize();
      })();
    }

    await initPromise;
    return httpServer!;
  }

  const middlewareHandler = async (options: AnyRequestServerOptions): Promise<AnyRequestServerResult> => {
    const server = await getHttpServer();
    const handler = createPaymentHandler(server, paywall, siwx);
    return handler(options);
  };

  return createMiddleware().server(options => middlewareHandler(options));
}

export type TanStackRequestMiddleware = ReturnType<
  ReturnType<typeof createMiddleware>['server']
>;

export type { Network } from '@lucid-agents/types/core';
export type { SolanaAddress } from '@lucid-agents/types/payments';
