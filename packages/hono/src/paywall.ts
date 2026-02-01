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
import type { Hono } from 'hono';
import type { FacilitatorConfig } from 'x402/types';
import { paymentMiddleware } from 'x402-hono';
import { z } from 'zod';

type PaymentMiddlewareFactory = typeof paymentMiddleware;

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
    ? z.toJSONSchema(entrypoint.input, { unrepresentable: 'any' })
    : undefined;
  const responseSchema = entrypoint.output
    ? z.toJSONSchema(entrypoint.output, { unrepresentable: 'any' })
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

  app.use(
    path,
    middlewareFactory(
      payments.payTo as Parameters<PaymentMiddlewareFactory>[0],
      {
        [`POST ${path}`]: postRoute,
        [`GET ${path}`]: getRoute,
      },
      resolvedFacilitator
    )
  );

  if (policyGroups && policyGroups.length > 0 && paymentTracker) {
    app.use(path, async (c, next) => {
      await next();

      const paymentResponseHeader = c.res.headers.get('X-PAYMENT-RESPONSE');
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
