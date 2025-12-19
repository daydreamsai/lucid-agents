import type { Hono } from 'hono';
import { paymentMiddleware } from '@x402/hono';
import type { EntrypointDef, AgentRuntime } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import {
  validatePaymentsConfig,
  evaluateSender,
  findMostSpecificIncomingLimit,
  extractSenderDomain,
  extractPayerAddress,
  parsePriceAmount,
  resolvePrice,
  buildRoutesConfig,
  type PaymentTracker,
  type x402ResourceServer,
} from '@lucid-agents/payments';

type PaymentMiddlewareFactory = typeof paymentMiddleware;

export type WithPaymentsParams = {
  app: Hono;
  path: string;
  entrypoint: EntrypointDef;
  kind: 'invoke' | 'stream';
  payments?: PaymentsConfig;
  /** Optional override - if not provided, uses runtime.payments.resourceServer */
  resourceServer?: x402ResourceServer;
  runtime?: AgentRuntime;
  /** @internal For testing only - override the middleware factory */
  middlewareFactory?: PaymentMiddlewareFactory;
};

export function withPayments({
  app,
  path,
  entrypoint,
  kind,
  payments,
  resourceServer: resourceServerOverride,
  runtime,
  middlewareFactory = paymentMiddleware,
}: WithPaymentsParams): boolean {
  if (!payments) return false;

  // Use provided resourceServer or get from runtime
  const resourceServer =
    resourceServerOverride ??
    (runtime?.payments?.resourceServer as x402ResourceServer | undefined);
  if (!resourceServer) return false;

  const network = entrypoint.network ?? payments.network;
  const price = resolvePrice(entrypoint, payments, kind);

  validatePaymentsConfig(payments, network, entrypoint.key);

  if (!price) return false;
  if (!payments.payTo) return false;
  if (!network) return false;

  // Build routes config using shared utility
  const routes = buildRoutesConfig(path, entrypoint, payments, kind);
  if (!routes) return false;

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

  // Use the provided resourceServer with the payment middleware
  app.use(path, middlewareFactory(routes, resourceServer));

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
