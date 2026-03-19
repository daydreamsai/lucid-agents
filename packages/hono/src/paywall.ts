import type { Hono, Context } from 'hono';
import {
  paymentMiddlewareFromConfig,
  type SchemeRegistration,
} from '@x402/hono';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import {
  HTTPFacilitatorClient,
  type FacilitatorConfig,
  type RouteConfig,
} from '@x402/core/server';
import type { EntrypointDef, AgentRuntime } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import type { SIWxConfig } from '@lucid-agents/types/siwx';
import type { AgentAuthContext } from '@lucid-agents/types/siwx';
import {
  createFacilitatorAuthHeaders,
  resolvePrice,
  resolvePayTo,
  validatePaymentsConfig,
  evaluateSender,
  findMostSpecificIncomingLimit,
  extractSenderDomain,
  extractPayerAddress,
  parsePriceAmount,
  parseSIWxHeader,
  verifySIWxPayload,
  buildSIWxExtensionDeclaration,
  entrypointHasSIWx,
  type PaymentTracker,
  type SIWxStorage,
} from '@lucid-agents/payments';

type PaymentMiddlewareFactory = typeof paymentMiddlewareFromConfig;

export type WithPaymentsParams = {
  app: Hono;
  path: string;
  entrypoint: EntrypointDef;
  kind: 'invoke' | 'stream';
  payments?: PaymentsConfig;
  facilitator?: FacilitatorConfig;
  middlewareFactory?: PaymentMiddlewareFactory;
  runtime?: AgentRuntime;
};

const DEFAULT_SCHEME = 'exact';
const DEFAULT_SCHEMES: SchemeRegistration[] = [
  {
    network: 'eip155:*',
    server: new ExactEvmScheme(),
  },
];

function withPaymentHeader(c: Context, paymentHeader: string): Context {
  const mergedHeaders = new Headers(c.req.raw.headers);
  if (!mergedHeaders.has('X-PAYMENT')) {
    mergedHeaders.set('X-PAYMENT', paymentHeader);
  }
  const requestWithPayment = new Request(c.req.raw, {
    headers: mergedHeaders,
  });
  const originalHeader = c.req.header.bind(c.req);
  const reqProxy = new Proxy(c.req, {
    get(target, prop, receiver) {
      if (prop === 'raw') {
        return requestWithPayment;
      }
      if (prop === 'header') {
        return (name?: string) => {
          if (!name) return originalHeader();
          if (name.toLowerCase() === 'x-payment') {
            return requestWithPayment.headers.get('X-PAYMENT') ?? undefined;
          }
          return originalHeader(name);
        };
      }
      return Reflect.get(target as object, prop, receiver);
    },
  });
  const contextProxy = new Proxy(c, {
    get(target, prop, receiver) {
      if (prop === 'req') {
        return reqProxy;
      }
      return Reflect.get(target as object, prop, receiver);
    },
  });
  return contextProxy as Context;
}

function addFacilitatorAuth(
  facilitator: FacilitatorConfig,
  token?: string
): FacilitatorConfig {
  if (facilitator.createAuthHeaders) {
    return facilitator;
  }

  const authHeaders = createFacilitatorAuthHeaders(token);
  if (!authHeaders) {
    return facilitator;
  }

  return {
    ...facilitator,
    createAuthHeaders: async () => authHeaders,
  };
}

/**
 * Creates a SIWX middleware that checks the SIGN-IN-WITH-X header
 * and verifies wallet authentication before the payment middleware.
 */
function createSiwxMiddleware(
  entrypoint: EntrypointDef,
  siwxStorage: SIWxStorage,
  siwxConfig: SIWxConfig
) {
  return async (c: Context, next: () => Promise<void>) => {
    const siwxHeader = c.req.header('SIGN-IN-WITH-X');

    if (!siwxHeader) {
      // No SIWX header - check if auth-only route (requires wallet auth)
      if (entrypoint.siwx?.authOnly) {
        const requestUrl = new URL(c.req.url);
        return c.json(
          {
            error: {
              code: 'auth_required',
              message: 'Wallet authentication required',
              siwx: buildSIWxExtensionDeclaration({
                resourceUri: c.req.url,
                domain: requestUrl.hostname,
                statement:
                  entrypoint.siwx?.statement ?? siwxConfig.defaultStatement,
                expirationSeconds: siwxConfig.expirationSeconds,
              }),
            },
          },
          401
        );
      }
      await next();
      return;
    }

    // Parse and verify SIWX header
    const payload = parseSIWxHeader(siwxHeader);
    if (!payload) {
      // Invalid header - for auth-only return 401, otherwise let payment middleware handle
      if (entrypoint.siwx?.authOnly) {
        return c.json(
          {
            error: {
              code: 'auth_failed',
              message: 'Invalid SIWX header',
            },
          },
          401
        );
      }
      await next();
      return;
    }

    const isAuthOnly = entrypoint.siwx?.authOnly === true;
    const requestUrl = new URL(c.req.url);
    const result = await verifySIWxPayload(payload, {
      storage: siwxStorage,
      resourceUri: c.req.url,
      domain: requestUrl.hostname,
      requireEntitlement: !isAuthOnly,
    });

    if (result.success) {
      // Set auth context for the handler
      (c as any).set('siwxAuth', {
        scheme: 'siwx' as const,
        address: result.address!,
        chainId: result.chainId!,
        grantedBy: result.grantedBy!,
        payload: result.payload as unknown as Record<string, unknown>,
      } satisfies AgentAuthContext);

      // Skip payment middleware - go straight to handler
      await next();
      return;
    }

    // Verification failed
    if (isAuthOnly) {
      return c.json(
        {
          error: {
            code: 'auth_failed',
            message: result.error ?? 'SIWX verification failed',
          },
        },
        401
      );
    }

    // For paid routes, let request continue to payment middleware
    await next();
  };
}

/**
 * Registers SIWX-only middleware for auth-only entrypoints (no payment required).
 * Returns true if middleware was registered.
 */
export function withSiwxAuth({
  app,
  path,
  entrypoint,
  runtime,
}: {
  app: Hono;
  path: string;
  entrypoint: EntrypointDef;
  runtime?: AgentRuntime;
}): boolean {
  if (!entrypoint.siwx?.authOnly) return false;

  const siwxStorage = runtime?.payments?.siwxStorage as
    | SIWxStorage
    | undefined;
  const siwxConfig = runtime?.payments?.siwxConfig;

  if (!siwxStorage || !siwxConfig) return false;

  app.use(path, createSiwxMiddleware(entrypoint, siwxStorage, siwxConfig));
  return true;
}

export function withPayments({
  app,
  path,
  entrypoint,
  kind,
  payments,
  facilitator,
  middlewareFactory = paymentMiddlewareFromConfig,
  runtime,
}: WithPaymentsParams): boolean {
  if (!payments) return false;

  const network = entrypoint.network ?? payments.network;
  const price = resolvePrice(entrypoint, payments, kind);

  if (!price) return false;

  validatePaymentsConfig(payments, network, entrypoint.key);
  const payTo = resolvePayTo(payments);

  const description =
    entrypoint.description ??
    `${entrypoint.key}${kind === 'stream' ? ' (stream)' : ''}`;
  const postMimeType =
    kind === 'stream' ? 'text/event-stream' : 'application/json';

  const baseFacilitator: FacilitatorConfig =
    facilitator ??
    ({ url: payments.facilitatorUrl } satisfies FacilitatorConfig);
  const resolvedFacilitator = addFacilitatorAuth(
    baseFacilitator,
    payments.facilitatorAuth
  );

  const postRoute: RouteConfig = {
    accepts: {
      scheme: DEFAULT_SCHEME,
      payTo: payTo as any,
      price,
      network,
    },
    description,
    mimeType: postMimeType,
  };

  const getRoute: RouteConfig = {
    accepts: {
      scheme: DEFAULT_SCHEME,
      payTo: payTo as any,
      price,
      network,
    },
    description,
    mimeType: 'application/json',
  };

  const policyGroups = runtime?.payments?.policyGroups;
  const paymentTracker = runtime?.payments?.paymentTracker as
    | PaymentTracker
    | undefined;

  // Check if SIWX is enabled for this entrypoint
  const hasSiwx = entrypointHasSIWx(entrypoint, payments.siwx);
  const siwxStorage = runtime?.payments?.siwxStorage as
    | SIWxStorage
    | undefined;
  const siwxConfig = runtime?.payments?.siwxConfig;

  // Register SIWX middleware BEFORE the payment middleware
  if (hasSiwx && siwxStorage && siwxConfig) {
    app.use(path, createSiwxMiddleware(entrypoint, siwxStorage, siwxConfig));
  }

  if (policyGroups && policyGroups.length > 0) {
    app.use(path, async (c, next) => {
      const senderDomain = extractSenderDomain(
        c.req.header('origin'),
        c.req.header('referer')
      );

      for (const group of policyGroups) {
        if (group.blockedSenders || group.allowedSenders) {
          const result = evaluateSender(group, undefined, senderDomain);
          if (!result.allowed) {
            return c.json(
              {
                error: {
                  code: 'policy_violation',
                  message: result.reason || 'Payment blocked by policy',
                  groupName: result.groupName,
                },
              },
              403
            );
          }
        }
      }

      await next();
    });
  }

  const facilitatorClient = new HTTPFacilitatorClient(resolvedFacilitator);
  const routes = {
    [`POST ${path}`]: postRoute,
    [`GET ${path}`]: getRoute,
  };

  const baseMiddleware = middlewareFactory(
    routes,
    facilitatorClient,
    DEFAULT_SCHEMES
  );

  app.use(path, async (c, next) => {
    // If SIWX already authenticated this request, skip payment middleware
    if ((c as any).get('siwxAuth')) {
      await next();
      return;
    }

    const paymentHeader = c.req.header('PAYMENT');
    const contextForPayment =
      paymentHeader && !c.req.header('X-PAYMENT')
        ? withPaymentHeader(c, paymentHeader)
        : c;
    const result = await baseMiddleware(contextForPayment, next);
    if (result instanceof Response) {
      // If returning a 402 and SIWX is enabled, add SIWX extension declaration
      if (hasSiwx && siwxStorage && siwxConfig) {
        try {
          const body = await result.json();
          const requestUrl = new URL(c.req.url);
          body.siwx = buildSIWxExtensionDeclaration({
            resourceUri: c.req.url,
            domain: requestUrl.hostname,
            statement:
              entrypoint.siwx?.statement ?? siwxConfig.defaultStatement,
            expirationSeconds: siwxConfig.expirationSeconds,
          });
          return c.json(body, result.status as any);
        } catch {
          return result;
        }
      }
      return result;
    }
  });

  // Post-settlement middleware: record payment tracking + SIWX entitlements
  if (
    (policyGroups && policyGroups.length > 0 && paymentTracker) ||
    (hasSiwx && siwxStorage)
  ) {
    app.use(path, async (c, next) => {
      await next();

      const paymentResponseHeader = c.res.headers.get('PAYMENT-RESPONSE');
      if (paymentResponseHeader && c.res.status >= 200 && c.res.status < 300) {
        try {
          const payerAddress = extractPayerAddress(paymentResponseHeader);
          const senderDomain = extractSenderDomain(
            c.req.header('origin'),
            c.req.header('referer')
          );
          const paymentAmount = parsePriceAmount(price);

          if (payerAddress && paymentAmount !== undefined) {
            // Record payment tracking for policy groups
            if (policyGroups && paymentTracker) {
              for (const group of policyGroups) {
                if (group.incomingLimits) {
                  const limitInfo = findMostSpecificIncomingLimit(
                    group.incomingLimits,
                    payerAddress,
                    senderDomain,
                    c.req.url
                  );
                  const scope = limitInfo?.scope ?? 'global';

                  await paymentTracker.recordIncoming(
                    group.name,
                    scope,
                    paymentAmount
                  );
                }
              }
            }

            // Record SIWX entitlement after successful payment
            if (hasSiwx && siwxStorage && payerAddress) {
              try {
                await siwxStorage.recordPayment(
                  c.req.url,
                  payerAddress,
                  network
                );
              } catch (err) {
                console.error(
                  '[paywall] Error recording SIWX entitlement:',
                  err
                );
              }
            }
          }
        } catch (error) {
          console.error('[paywall] Error recording incoming payment:', error);
        }
      }
    });
  }

  return true;
}
