import type { Express, RequestHandler, Request, Response } from 'express';
import { paymentMiddleware } from 'x402-express';
import type { FacilitatorConfig } from 'x402/types';
import { z } from 'zod';
import type { EntrypointDef, AgentRuntime } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import {
  resolvePrice,
  validatePaymentsConfig,
  evaluateSender,
  findMostSpecificIncomingLimit,
  extractSenderDomain,
  extractPayerAddress,
  parsePriceAmount,
  encodePaymentRequiredHeader,
  type PaymentTracker,
} from '@lucid-agents/payments';

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

function normalizePaymentHeaders(res: Response) {
  if (res.headersSent) return;

  const paymentResponseHeader =
    (res.getHeader('PAYMENT-RESPONSE') as string | undefined) ??
    (res.getHeader('X-PAYMENT-RESPONSE') as string | undefined);
  if (paymentResponseHeader) {
    res.setHeader('PAYMENT-RESPONSE', paymentResponseHeader);
  }
  res.removeHeader('X-PAYMENT-RESPONSE');

  const paymentRequiredHeader = res.getHeader('PAYMENT-REQUIRED');
  if (!paymentRequiredHeader) {
    const price = res.getHeader('X-Price');
    const payTo = res.getHeader('X-Pay-To');
    if (price && payTo) {
      res.setHeader(
        'PAYMENT-REQUIRED',
        encodePaymentRequiredHeader({
          price: String(price),
          payTo: String(payTo),
          network: (res.getHeader('X-Network') as string | undefined) ?? undefined,
          facilitatorUrl:
            (res.getHeader('X-Facilitator') as string | undefined) ?? undefined,
        })
      );
    }
  }

  res.removeHeader('X-Price');
  res.removeHeader('X-Pay-To');
  res.removeHeader('X-Network');
  res.removeHeader('X-Facilitator');
}

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
      const paymentHeader =
        (req.headers['payment'] as string | string[] | undefined) ??
        (req.headers['Payment'] as string | string[] | undefined);
      if (paymentHeader && !req.headers['x-payment']) {
        req.headers['x-payment'] = Array.isArray(paymentHeader)
          ? paymentHeader[0]
          : paymentHeader;
      }
      const originalEnd = res.end.bind(res);
      res.end = function (chunk?: any, encoding?: any, cb?: any) {
        normalizePaymentHeaders(res);
        return originalEnd(chunk, encoding, cb);
      };
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

        const paymentResponseHeader =
          (res.getHeader('PAYMENT-RESPONSE') as string | undefined) ??
          (res.getHeader('X-PAYMENT-RESPONSE') as string | undefined);
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
