import type { Express, RequestHandler } from 'express';
import {
  paymentMiddlewareFromConfig,
  type SchemeRegistration,
} from '@x402/express';
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

const DEFAULT_SCHEME = 'exact';
const DEFAULT_SCHEMES: SchemeRegistration[] = [
  {
    network: 'eip155:*',
    server: new ExactEvmScheme(),
  },
];

type PaymentMiddlewareFactory = typeof paymentMiddlewareFromConfig;

export type WithPaymentsParams = {
  app: Express;
  path: string;
  entrypoint: EntrypointDef;
  kind: 'invoke' | 'stream';
  payments?: PaymentsConfig;
  facilitator?: FacilitatorConfig;
  middlewareFactory?: PaymentMiddlewareFactory;
  runtime?: AgentRuntime;
};

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
    app.use((req, res, next) => {
      const reqPath = req.path ?? req.url ?? '';
      if (
        reqPath === path ||
        reqPath.startsWith(`${path}/`) ||
        req.originalUrl === path ||
        req.originalUrl?.startsWith(`${path}?`)
      ) {
        const origin =
          typeof req.headers.origin === 'string'
            ? req.headers.origin
            : Array.isArray(req.headers.origin)
              ? req.headers.origin[0]
              : undefined;
        const referer =
          typeof req.headers.referer === 'string'
            ? req.headers.referer
            : Array.isArray(req.headers.referer)
              ? req.headers.referer[0]
              : undefined;
        const senderDomain = extractSenderDomain(origin, referer);

        for (const group of policyGroups) {
          if (group.blockedSenders || group.allowedSenders) {
            const result = evaluateSender(group, undefined, senderDomain);
            if (!result.allowed) {
              return res.status(403).json({
                error: {
                  code: 'policy_violation',
                  message: result.reason || 'Payment blocked by policy',
                  groupName: result.groupName,
                },
              });
            }
          }
        }
      }
      return next();
    });
  }

  const facilitatorClient = new HTTPFacilitatorClient(resolvedFacilitator);
  const routes: Record<string, RouteConfig> = {
    [`POST ${path}`]: postRoute,
    [`GET ${path}`]: getRoute,
  };

  const middleware = middlewareFactory(
    routes,
    facilitatorClient,
    DEFAULT_SCHEMES
  ) as RequestHandler;

  app.use((req, res, next) => {
    const reqPath = req.path ?? req.url ?? '';
    if (
      reqPath === path ||
      reqPath.startsWith(`${path}/`) ||
      req.originalUrl === path ||
      req.originalUrl?.startsWith(`${path}?`)
    ) {
      const paymentHeader =
        (req.headers['payment'] as string | string[] | undefined) ??
        (req.headers['Payment'] as string | string[] | undefined);
      if (paymentHeader && !req.headers['x-payment']) {
        req.headers['x-payment'] = Array.isArray(paymentHeader)
          ? paymentHeader[0]
          : paymentHeader;
      }
      return middleware(req, res, next);
    }
    return next();
  });

  if (policyGroups && policyGroups.length > 0 && paymentTracker) {
    app.use(async (req, res, next) => {
      const reqPath = req.path ?? req.url ?? '';
      if (
        reqPath === path ||
        reqPath.startsWith(`${path}/`) ||
        req.originalUrl === path ||
        req.originalUrl?.startsWith(`${path}?`)
      ) {
        const originalEnd = res.end.bind(res);
        let recordingPromise: Promise<void> | undefined;

        res.end = function (chunk?: any, encoding?: any, cb?: any) {
          if (recordingPromise) {
            recordingPromise
              .then(() => {
                originalEnd(chunk, encoding, cb);
              })
              .catch(error => {
                console.error(
                  '[paywall] Error in payment recording, sending response anyway:',
                  error
                );
                originalEnd(chunk, encoding, cb);
              });
            return res;
          }
          return originalEnd(chunk, encoding, cb);
        };

        next();

        const paymentResponseHeader = res.getHeader('PAYMENT-RESPONSE') as
          | string
          | undefined;
        if (
          paymentResponseHeader &&
          res.statusCode >= 200 &&
          res.statusCode < 300
        ) {
          try {
            const payerAddress = extractPayerAddress(paymentResponseHeader);
            const origin =
              typeof req.headers.origin === 'string'
                ? req.headers.origin
                : Array.isArray(req.headers.origin)
                  ? req.headers.origin[0]
                  : undefined;
            const referer =
              typeof req.headers.referer === 'string'
                ? req.headers.referer
                : Array.isArray(req.headers.referer)
                  ? req.headers.referer[0]
                  : undefined;
            const senderDomain = extractSenderDomain(origin, referer);
            const paymentAmount = parsePriceAmount(price);

            if (payerAddress && paymentAmount !== undefined) {
              const recordPromises: Promise<void>[] = [];
              for (const group of policyGroups) {
                if (group.incomingLimits) {
                  const limitInfo = findMostSpecificIncomingLimit(
                    group.incomingLimits,
                    payerAddress,
                    senderDomain,
                    req.url
                  );
                  const scope = limitInfo?.scope ?? 'global';

                  recordPromises.push(
                    paymentTracker
                      .recordIncoming(group.name, scope, paymentAmount)
                      .catch(error => {
                        console.error(
                          `[paywall] Error recording incoming payment for group "${group.name}":`,
                          error
                        );
                      })
                  );
                }
              }
              recordingPromise = Promise.all(recordPromises).then(() => {});
            }
          } catch (error) {
            console.error(
              '[paywall] Error processing incoming payment:',
              error
            );
          }
        }
        return;
      }
      return next();
    });
  }

  return true;
}
