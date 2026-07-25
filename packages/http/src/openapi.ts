import type { EntrypointDef } from '@lucid-agents/types/core';
import type { X402PaymentProjection } from '@lucid-agents/types/payments';
import { z } from 'zod';

/** Adds protocol-owned payment metadata to one OpenAPI operation. */
export type OpenApiPaymentProjection = (
  entrypoint: EntrypointDef,
  operation: 'invoke' | 'stream'
) => Record<string, unknown> | undefined;

/** Inputs used to build the framework-neutral HTTP OpenAPI document. */
export type BuildOpenApiDocumentOptions = {
  title: string;
  version: string;
  description?: string;
  basePath: string;
  entrypoints: Iterable<EntrypointDef>;
  projectPayment?: OpenApiPaymentProjection;
  /** Protocol-owned OpenAPI components referenced by projected operations. */
  paymentComponents?:
    | Record<string, unknown>
    | readonly Record<string, unknown>[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeDocumentValue(base: unknown, overlay: unknown): unknown {
  if (!isRecord(base) || !isRecord(overlay)) return overlay;
  if (Object.keys(overlay).length === 0) return base;
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    merged[key] = key in base ? mergeDocumentValue(base[key], value) : value;
  }
  return merged;
}

function schemaFor(
  schema: EntrypointDef['input'] | EntrypointDef['output']
): unknown {
  return schema ? z.toJSONSchema(schema) : {};
}

function operationFor(
  entrypoint: EntrypointDef,
  operation: 'invoke' | 'stream',
  projectPayment: OpenApiPaymentProjection | undefined
): Record<string, unknown> {
  const payment = projectPayment?.(entrypoint, operation);
  const isX402 = Boolean(payment?.['x-x402-payment']);
  const legacyPrice =
    typeof entrypoint.price === 'string'
      ? entrypoint.price
      : entrypoint.price?.[operation];
  const isPaid =
    Boolean(payment) ||
    Boolean(legacyPrice?.trim()) ||
    Boolean(entrypoint.x402?.offers.length);
  const responses: Record<string, unknown> = {
    '200': {
      description:
        operation === 'stream'
          ? 'Server-sent event stream'
          : 'Successful invocation',
      content:
        operation === 'stream'
          ? {
              'text/event-stream': {
                schema: { type: 'string' },
              },
            }
          : {
              'application/json': {
                schema: schemaFor(entrypoint.output),
              },
            },
    },
  };
  if (isPaid) {
    responses['402'] = {
      description: 'Payment required',
      headers: {
        ...(isX402
          ? {
              'PAYMENT-REQUIRED': {
                schema: { type: 'string' },
                description: 'x402 payment requirements',
              },
              'PAYMENT-RESPONSE': {
                schema: { type: 'string' },
                description: 'x402 settlement receipt',
              },
            }
          : {
              'WWW-Authenticate': {
                schema: { type: 'string' },
                description: 'Payment Authentication challenges',
              },
              'Payment-Receipt': {
                schema: { type: 'string' },
                description: 'Payment Authentication receipt',
              },
            }),
      },
      content: {
        'application/problem+json': {
          schema: { $ref: '#/components/schemas/PaymentProblem' },
        },
      },
    };
  }
  const operationDocument: Record<string, unknown> = {
    operationId: `${operation}_${entrypoint.key}`,
    summary:
      entrypoint.description ??
      `${operation === 'invoke' ? 'Invoke' : 'Stream'} ${entrypoint.key}`,
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: schemaFor(entrypoint.input),
        },
      },
    },
    responses,
  };
  return payment
    ? (mergeDocumentValue(operationDocument, payment) as Record<
        string,
        unknown
      >)
    : operationDocument;
}

/**
 * Build the framework-neutral OpenAPI document used by every HTTP adapter.
 */
export function buildOpenApiDocument({
  title,
  version,
  description,
  basePath,
  entrypoints,
  projectPayment,
  paymentComponents,
}: BuildOpenApiDocumentOptions): Record<string, unknown> {
  const paths: Record<string, unknown> = {};
  const prefix = basePath || '';

  for (const entrypoint of entrypoints) {
    const encodedKey = encodeURIComponent(entrypoint.key);
    if (entrypoint.handler) {
      paths[`${prefix}/entrypoints/${encodedKey}/invoke`] = {
        post: operationFor(entrypoint, 'invoke', projectPayment),
      };
    }
    if (entrypoint.stream) {
      paths[`${prefix}/entrypoints/${encodedKey}/stream`] = {
        post: operationFor(entrypoint, 'stream', projectPayment),
      };
    }
  }

  const contributedComponents = Array.isArray(paymentComponents)
    ? paymentComponents
    : paymentComponents
      ? [paymentComponents]
      : [];
  const components = contributedComponents.reduce<unknown>(
    (current, contribution) => mergeDocumentValue(current, contribution),
    {
      schemas: {
        PaymentProblem: {
          type: 'object',
          required: ['type', 'title', 'status'],
          properties: {
            type: { type: 'string', format: 'uri-reference' },
            title: { type: 'string' },
            status: { type: 'integer' },
            detail: { type: 'string' },
            instance: { type: 'string', format: 'uri-reference' },
          },
        },
      },
    }
  );

  return {
    openapi: '3.1.0',
    info: {
      title,
      version,
      ...(description ? { description } : {}),
    },
    paths,
    components,
  };
}

/** Map x402-owned discovery into the canonical HTTP OpenAPI operation. */
export function projectX402OpenApiPayment(
  projection: X402PaymentProjection
): Record<string, unknown> {
  return {
    'x-x402-payment': {
      entrypointKey: projection.entrypointKey,
      kind: projection.kind,
      offers: projection.offers,
      extensions: projection.extensions,
    },
  };
}
