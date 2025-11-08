import type { FacilitatorConfig } from 'x402/types';
import { paymentMiddleware } from 'x402-hono';

import { resolveEntrypointPrice } from './pricing';
import type { EntrypointDef, PaymentsConfig } from './types';
import { toJsonSchemaOrUndefined } from './utils';
import { validatePaymentsConfig } from './validation';

type PaymentMiddlewareFactory = typeof paymentMiddleware;

export type WithPaymentsParams = {
  app: { use: (path: string, ...handlers: unknown[]) => void };
  path: string;
  entrypoint: EntrypointDef;
  kind: 'invoke' | 'stream';
  payments?: PaymentsConfig;
  facilitator?: FacilitatorConfig;
  middlewareFactory?: PaymentMiddlewareFactory;
};

export function withPayments({
  app,
  path,
  entrypoint,
  kind,
  payments,
  facilitator,
  middlewareFactory = paymentMiddleware,
}: WithPaymentsParams): boolean {
  if (!payments) return false;

  const network = entrypoint.network ?? payments.network;
  const price = resolveEntrypointPrice(entrypoint, payments, kind);

  validatePaymentsConfig(payments, network, entrypoint.key);

  if (!price) return false;
  const requestSchema = toJsonSchemaOrUndefined(entrypoint.input);
  const responseSchema = toJsonSchemaOrUndefined(entrypoint.output);

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

  app.use(
    path,
    middlewareFactory(
      payments.payTo,
      {
        [`POST ${path}`]: postRoute,
        [`GET ${path}`]: getRoute,
      },
      resolvedFacilitator
    )
  );
  return true;
}
