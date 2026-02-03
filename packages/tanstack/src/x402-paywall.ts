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

type RoutesConfigResolver =
  | RoutesConfig
  | (() => RoutesConfig | Promise<RoutesConfig>);

type AnyRequestServerOptions = RequestServerOptions<any, any>;
type AnyRequestServerResult = RequestServerResult<any, any, any>;

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

function createPaymentHandler(
  httpServer: x402HTTPResourceServer,
  paywallConfig?: PaywallConfig
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
  paywall?: PaywallConfig
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
    const handler = createPaymentHandler(server, paywall);
    return handler(options);
  };

  return createMiddleware().server(options => middlewareHandler(options));
}

export type TanStackRequestMiddleware = ReturnType<
  ReturnType<typeof createMiddleware>['server']
>;

export type { Network } from '@lucid-agents/types/core';
export type { SolanaAddress } from '@lucid-agents/types/payments';
