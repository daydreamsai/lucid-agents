import type { AgentHttpRuntime } from '@lucid-agents/core';
import { toJsonSchemaOrUndefined } from '@lucid-agents/core';
import type { EntrypointDef } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import { resolvePrice, validatePaymentsConfig } from '@lucid-agents/payments';
import type {
  FacilitatorConfig,
  PaywallConfig,
  RouteConfig,
  RoutesConfig,
} from 'x402/types';
import {
  paymentMiddleware,
  type TanStackRequestMiddleware,
} from '@lucid-agents/x402-tanstack-start';

type RuntimeLike = {
  payments?: { config: PaymentsConfig };
  entrypoints: { snapshot: () => EntrypointDef[] };
};

type PaymentMiddlewareFactory = typeof paymentMiddleware;

type EntrypointPaymentKind = 'invoke' | 'stream';

export type CreateTanStackPaywallOptions = {
  runtime: RuntimeLike;
  /**
   * Base path prefix used for agent HTTP routes (e.g. `/api/agent`).
   * Defaults to `/api/agent`.
   */
  basePath?: string;
  payments?: PaymentsConfig;
  facilitator?: FacilitatorConfig;
  paywall?: PaywallConfig;
  middlewareFactory?: PaymentMiddlewareFactory;
};

export type TanStackPaywall = {
  invoke?: TanStackRequestMiddleware;
  stream?: TanStackRequestMiddleware;
};

function normalizeBasePath(path?: string) {
  if (!path) return '/api/agent';
  if (!path.startsWith('/')) {
    return `/${path.replace(/^\/+/, '').replace(/\/+$/, '')}`;
  }
  return path.replace(/\/+$/, '') || '/';
}

type BuildRoutesParams = {
  entrypoints: EntrypointDef[];
  payments: PaymentsConfig;
  basePath: string;
  kind: EntrypointPaymentKind;
};

function buildEntrypointRoutes({
  entrypoints,
  payments,
  basePath,
  kind,
}: BuildRoutesParams): RoutesConfig {
  const routes: RoutesConfig = {};
  for (const entrypoint of entrypoints) {
    if (kind === 'stream' && !entrypoint.stream) continue;
    const network = entrypoint.network ?? payments.network;
    const price = resolvePrice(entrypoint, payments, kind);

    validatePaymentsConfig(payments, network, entrypoint.key);

    if (!network || !price) continue;

    const requestSchema = toJsonSchemaOrUndefined(entrypoint.input);
    const responseSchema =
      kind === 'invoke'
        ? toJsonSchemaOrUndefined(entrypoint.output)
        : undefined;
    const description =
      entrypoint.description ??
      `${entrypoint.key}${kind === 'stream' ? ' (stream)' : ''}`;
    const path = `${basePath}/entrypoints/${entrypoint.key}/${kind}`;
    const inputSchema = {
      bodyType: 'json' as const,
      ...(requestSchema ? { bodyFields: { input: requestSchema } } : {}),
    };
    const outputSchema =
      kind === 'invoke' && responseSchema
        ? { output: responseSchema }
        : undefined;

    const postRoute: RouteConfig = {
      price,
      network,
      config: {
        description,
        mimeType: kind === 'stream' ? 'text/event-stream' : 'application/json',
        discoverable: true,
        inputSchema,
        outputSchema,
      },
    };

    const getRoute: RouteConfig = {
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

    routes[`POST ${path}`] = postRoute;
    routes[`GET ${path}`] = getRoute;
  }
  return routes;
}

export function createTanStackPaywall({
  runtime,
  basePath,
  payments,
  facilitator,
  paywall,
  middlewareFactory = paymentMiddleware,
}: CreateTanStackPaywallOptions): TanStackPaywall {
  const activePayments = payments ?? runtime.payments?.config;
  if (!activePayments) {
    return {};
  }

  const normalizedBasePath = normalizeBasePath(basePath);
  const entrypoints = runtime.entrypoints.snapshot();
  const resolvedFacilitator: FacilitatorConfig =
    facilitator ??
    ({ url: activePayments.facilitatorUrl } satisfies FacilitatorConfig);
  const payTo = activePayments.payTo as Parameters<PaymentMiddlewareFactory>[0];

  const invokeRoutes = buildEntrypointRoutes({
    entrypoints,
    payments: activePayments,
    basePath: normalizedBasePath,
    kind: 'invoke',
  });

  const streamRoutes = buildEntrypointRoutes({
    entrypoints,
    payments: activePayments,
    basePath: normalizedBasePath,
    kind: 'stream',
  });

  const invoke =
    Object.keys(invokeRoutes).length > 0
      ? middlewareFactory(payTo, invokeRoutes, resolvedFacilitator, paywall)
      : undefined;

  const stream =
    Object.keys(streamRoutes).length > 0
      ? middlewareFactory(payTo, streamRoutes, resolvedFacilitator, paywall)
      : undefined;

  return { invoke, stream };
}
