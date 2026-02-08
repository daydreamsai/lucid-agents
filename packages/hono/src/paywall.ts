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
import {
  createFacilitatorAuthHeaders,
  resolvePrice,
  validatePaymentsConfig,
  evaluateSender,
  findMostSpecificIncomingLimit,
  extractSenderDomain,
  extractPayerAddress,
  parsePriceAmount,
  type PaymentTracker,
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

  validatePaymentsConfig(payments, network, entrypoint.key);

  if (!price) return false;
  if (!payments.payTo) return false;

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
      payTo: payments.payTo,
      price,
      network,
    },
    description,
    mimeType: postMimeType,
  };

  const getRoute: RouteConfig = {
    accepts: {
      scheme: DEFAULT_SCHEME,
      payTo: payments.payTo,
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
    const paymentHeader = c.req.header('PAYMENT');
    const contextForPayment =
      paymentHeader && !c.req.header('X-PAYMENT')
        ? withPaymentHeader(c, paymentHeader)
        : c;
    const result = await baseMiddleware(contextForPayment, next);
    if (result instanceof Response) {
      return result;
    }
  });

  if (policyGroups && policyGroups.length > 0 && paymentTracker) {
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
        } catch (error) {
          console.error('[paywall] Error recording incoming payment:', error);
        }
      }
    });
  }

  return true;
}
