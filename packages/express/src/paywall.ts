import {
  evaluateSender,
  extractPayerAddress,
  extractSenderDomain,
  findMostSpecificIncomingLimit,
  parsePriceAmount,
  type PaymentTracker,
  resolvePrice,
  validatePaymentsConfig,
} from '@lucid-agents/payments';
import type { AgentRuntime, EntrypointDef } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import type { Express, RequestHandler } from 'express';
import type { FacilitatorConfig } from 'x402/types';
import { paymentMiddleware } from 'x402-express';
import { z } from 'zod';

type PaymentMiddlewareFactory = typeof paymentMiddleware;

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

export function withPayments({
  app,
  path,
  entrypoint,
  kind,
  payments,
  facilitator,
  middlewareFactory = paymentMiddleware,
  runtime,
}: WithPaymentsParams): boolean {
  if (!payments) return false;

  const network = entrypoint.network ?? payments.network;
  const price = resolvePrice(entrypoint, payments, kind);

  validatePaymentsConfig(payments, network, entrypoint.key);

  if (!price) return false;
  if (!payments.payTo) return false;

  const requestSchema = entrypoint.input
    ? z.toJSONSchema(entrypoint.input)
    : undefined;
  const responseSchema = entrypoint.output
    ? z.toJSONSchema(entrypoint.output)
    : undefined;

  const description =
    entrypoint.description ??
    `${entrypoint.key}${kind === 'stream' ? ' (stream)' : ''}`;
  const postMimeType =
    kind === 'stream' ? 'text/event-stream' : 'application/json';
  const inputSchema = {
    bodyType: 'json' as const,
    ...(requestSchema ? { bodyFields: { input: requestSchema } } : {}),
  };
  const outputSchema =
    kind === 'invoke' && responseSchema
      ? { output: responseSchema }
      : undefined;

  const resolvedFacilitator: FacilitatorConfig =
    facilitator ??
    ({ url: payments.facilitatorUrl } satisfies FacilitatorConfig);

  const postRoute = {
    price,
    network,
    config: {
      description,
      mimeType: postMimeType,
      discoverable: true,
      inputSchema,
      outputSchema,
    },
  };

  const getRoute = {
    price,
    network,
    config: {
      description,
      mimeType: 'application/json',
      discoverable: true,
      inputSchema,
      outputSchema,
    },
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

  const middleware = middlewareFactory(
    payments.payTo as Parameters<PaymentMiddlewareFactory>[0],
    {
      [`POST ${path}`]: postRoute,
      [`GET ${path}`]: getRoute,
    },
    resolvedFacilitator
  ) as unknown as RequestHandler;

  app.use((req, res, next) => {
    const reqPath = req.path ?? req.url ?? '';
    if (
      reqPath === path ||
      reqPath.startsWith(`${path}/`) ||
      req.originalUrl === path ||
      req.originalUrl?.startsWith(`${path}?`)
    ) {
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

        await next();

        const paymentResponseHeader = res.getHeader('X-PAYMENT-RESPONSE') as
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
