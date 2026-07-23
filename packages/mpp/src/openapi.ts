import type { EntrypointDef } from '@lucid-agents/types/core';
import type {
  EntrypointMppConfig,
  MppConfig,
  MppOpenApiComponents,
  MppOpenApiDocument,
  MppOpenApiOffer,
  MppOpenApiOperation,
  MppOpenApiProjectionOptions,
  MppPaymentIntent,
  MppServerMethod,
} from '@lucid-agents/types/mpp';
import { DiscoveryDocument, PaymentInfo } from 'mppx/discovery';

import {
  mppBaseUnits,
  resolveEntrypointMppConfig,
  resolveEntrypointPrice,
} from './challenge';
import { resolveMppMethodImplementation } from './method-implementation';

/** Server offer normalized for live challenges and OpenAPI discovery. */
export type MppResolvedOffer = MppOpenApiOffer & {
  /** Display amount passed to live challenge generation. */
  challengeAmount: string;
};

/** Inputs for building a configured MPP OpenAPI document. */
export type ProjectMppOpenApiOptions = MppOpenApiProjectionOptions & {
  config: MppConfig;
};

function supportsIntent(
  method: MppServerMethod,
  intent: MppPaymentIntent
): boolean {
  const implementation = resolveMppMethodImplementation(method);
  if (implementation === 'custom') return true;
  if (implementation === 'tempo-session') return intent === 'session';
  return intent === 'charge';
}

function methodCurrency(
  config: MppConfig,
  method: MppServerMethod,
  entrypointConfig: EntrypointMppConfig | undefined
): string {
  const configured = (method.config as { currency?: unknown }).currency;
  return (
    entrypointConfig?.currency ??
    (typeof configured === 'string' ? configured : undefined) ??
    config.currency ??
    'usd'
  );
}

function discoveryAmount(
  method: MppServerMethod,
  amount: string
): string | null {
  const implementation = resolveMppMethodImplementation(method);
  const rawDecimals = (method.config as { decimals?: unknown }).decimals;
  const decimals =
    implementation === 'tempo' || implementation === 'tempo-session'
      ? typeof rawDecimals === 'number'
        ? rawDecimals
        : 6
      : implementation === 'stripe'
        ? typeof rawDecimals === 'number'
          ? rawDecimals
          : 2
        : typeof rawDecimals === 'number'
          ? rawDecimals
          : undefined;
  if (decimals !== undefined) return mppBaseUnits(amount, decimals);
  return /^(0|[1-9][0-9]*)$/.test(amount.trim()) ? amount.trim() : null;
}

/**
 * Resolve the ordered server offers for one entrypoint operation.
 *
 * Authorization and discovery call this same function so method, intent,
 * amount, currency, and description cannot silently drift.
 */
export function resolveMppOffers(
  config: MppConfig,
  entrypoint: EntrypointDef,
  kind: 'invoke' | 'stream'
): MppResolvedOffer[] {
  if (entrypoint.paymentProtocol === 'x402') return [];
  const price = resolveEntrypointPrice(entrypoint, kind);
  if (!price) return [];

  const entrypointConfig = resolveEntrypointMppConfig(entrypoint);
  const intent = entrypointConfig?.intent ?? config.defaultIntent ?? 'charge';
  const defaultAmount = entrypointConfig?.amount ?? price;
  const selected = entrypointConfig?.methods
    ? entrypointConfig.methods.flatMap(name =>
        config.methods.filter(method => method.name === name)
      )
    : config.methods;

  return selected
    .filter(method => supportsIntent(method, intent))
    .map(method => {
      const amount =
        resolveMppMethodImplementation(method) === 'tempo-session'
          ? (method.config as { amount: string }).amount
          : defaultAmount;
      return {
        amount: discoveryAmount(method, amount),
        challengeAmount: amount,
        currency: methodCurrency(config, method, entrypointConfig),
        ...((entrypointConfig?.description ?? entrypoint.description)
          ? {
              description:
                entrypointConfig?.description ?? entrypoint.description,
            }
          : {}),
        intent,
        method: method.name,
      };
    });
}

function normalizeBasePath(value: string | undefined): string {
  if (!value || value === '/') return '';
  return `/${value.replace(/^\/+|\/+$/g, '')}`;
}

function paymentOperation(
  entrypoint: EntrypointDef,
  kind: 'invoke' | 'stream',
  offers: MppResolvedOffer[]
): Record<string, unknown> {
  const payment = projectMppPaymentFromOffers(offers);
  const x402Compatible = offers.some(offer => offer.method === 'evm');
  const operation: Record<string, unknown> = {
    operationId: `${kind}-${entrypoint.key}`,
    ...(entrypoint.description ? { summary: entrypoint.description } : {}),
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {},
        },
      },
    },
    responses: {
      '200': {
        description:
          kind === 'stream'
            ? 'Successful event stream'
            : 'Successful invocation',
        ...(offers.length > 0
          ? {
              headers: {
                'Payment-Receipt': {
                  $ref: '#/components/headers/PaymentReceipt',
                },
                ...(x402Compatible
                  ? {
                      'PAYMENT-RESPONSE': {
                        $ref: '#/components/headers/PaymentResponse',
                      },
                    }
                  : {}),
              },
            }
          : {}),
      },
      ...(offers.length > 0
        ? {
            '402': {
              description: 'Payment required',
              headers: {
                'WWW-Authenticate': {
                  $ref: '#/components/headers/WWWAuthenticate',
                },
                ...(x402Compatible
                  ? {
                      'PAYMENT-REQUIRED': {
                        $ref: '#/components/headers/PaymentRequired',
                      },
                    }
                  : {}),
              },
              content: {
                'application/problem+json': {
                  schema: {
                    $ref: '#/components/schemas/ProblemDetails',
                  },
                },
              },
            },
          }
        : {}),
    },
  };

  return { ...operation, ...(payment ?? {}) };
}

function projectMppPaymentFromOffers(
  offers: MppResolvedOffer[]
): MppOpenApiOperation | undefined {
  if (offers.length === 0) return undefined;
  const projectedOffers = offers.map(
    ({ challengeAmount: _challengeAmount, ...offer }) => offer
  );
  PaymentInfo.parse({ offers: projectedOffers });
  return {
    parameters: [
      { $ref: '#/components/parameters/AcceptPayment' },
      { $ref: '#/components/parameters/PaymentCredential' },
      ...(offers.some(offer => offer.method === 'evm')
        ? [{ $ref: '#/components/parameters/PaymentSignature' }]
        : []),
    ],
    security: [{ Payment: [] }],
    'x-payment-info': { offers: projectedOffers },
  };
}

/** Project MPP metadata for one canonical HTTP OpenAPI operation. */
export function projectMppPayment(
  config: MppConfig,
  entrypoint: EntrypointDef,
  kind: 'invoke' | 'stream'
): MppOpenApiOperation | undefined {
  return projectMppPaymentFromOffers(
    resolveMppOffers(config, entrypoint, kind)
  );
}

/** Components referenced by `projectMppPayment`. */
export function getMppOpenApiComponents(): MppOpenApiComponents {
  return {
    securitySchemes: {
      Payment: {
        type: 'http',
        scheme: 'Payment',
        description:
          'Payment-Auth credential serialized in the Authorization header.',
      },
    },
    parameters: {
      AcceptPayment: {
        name: 'Accept-Payment',
        in: 'header',
        required: false,
        description: 'Ordered method/intent preferences using HTTP q-values.',
        schema: { type: 'string' },
      },
      PaymentCredential: {
        name: 'Authorization',
        in: 'header',
        required: false,
        description: 'Payment-Auth credential for a selected challenge.',
        schema: { $ref: '#/components/schemas/PaymentCredential' },
      },
      PaymentSignature: {
        name: 'PAYMENT-SIGNATURE',
        in: 'header',
        required: false,
        description:
          'x402 v2 exact credential accepted by a native EVM charge offer.',
        schema: { type: 'string', minLength: 1 },
      },
    },
    headers: {
      WWWAuthenticate: {
        description:
          'One or more Payment challenges ordered by server negotiation.',
        schema: { type: 'string' },
      },
      PaymentReceipt: {
        description: 'Serialized proof of successful payment.',
        schema: { $ref: '#/components/schemas/PaymentReceipt' },
      },
      PaymentRequired: {
        description:
          'x402 v2 payment requirements for a compatible EVM charge offer.',
        schema: { type: 'string', minLength: 1 },
      },
      PaymentResponse: {
        description: 'x402 v2 successful settlement response.',
        schema: { type: 'string', minLength: 1 },
      },
    },
    schemas: {
      ProblemDetails: {
        type: 'object',
        required: ['type', 'title', 'status'],
        properties: {
          type: { type: 'string', format: 'uri-reference' },
          title: { type: 'string' },
          status: { type: 'integer' },
          detail: { type: 'string' },
          challengeId: { type: 'string' },
        },
      },
      PaymentCredential: {
        type: 'string',
        pattern: '^Payment\\\\s+[A-Za-z0-9_-]+$',
        description: 'Value of the Authorization header.',
      },
      PaymentReceipt: {
        type: 'string',
        minLength: 1,
        maxLength: 8192,
        description: 'Value of the Payment-Receipt response header.',
      },
    },
  };
}

/** Build a secret-free OpenAPI 3.1 MPP discovery document. */
export function projectMppOpenApi({
  title,
  version,
  basePath,
  config,
  entrypoints,
}: ProjectMppOpenApiOptions): MppOpenApiDocument {
  const root = normalizeBasePath(basePath);
  const paths: MppOpenApiDocument['paths'] = {};

  for (const entrypoint of entrypoints) {
    const encodedKey = encodeURIComponent(entrypoint.key);
    if (entrypoint.handler) {
      const invokeOffers = resolveMppOffers(config, entrypoint, 'invoke');
      paths[`${root}/entrypoints/${encodedKey}/invoke`] = {
        post: paymentOperation(entrypoint, 'invoke', invokeOffers),
      };
    }
    if (entrypoint.stream) {
      const streamOffers = resolveMppOffers(config, entrypoint, 'stream');
      paths[`${root}/entrypoints/${encodedKey}/stream`] = {
        post: paymentOperation(entrypoint, 'stream', streamOffers),
      };
    }
  }

  const document: MppOpenApiDocument = {
    openapi: '3.1.0',
    info: { title, version },
    paths,
    components: getMppOpenApiComponents(),
  };

  return DiscoveryDocument.parse(document) as MppOpenApiDocument;
}
