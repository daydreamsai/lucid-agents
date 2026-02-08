import type { EntrypointDef } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import {
  createFacilitatorAuthHeaders,
  resolvePrice,
  validatePaymentsConfig,
} from '@lucid-agents/payments';
import type {
  FacilitatorConfig,
  PaywallConfig,
  RouteConfig,
} from '@x402/core/server';
import {
  paymentMiddleware,
  type TanStackRequestMiddleware,
} from './x402-paywall';

const DEFAULT_SCHEME = 'exact';

type RuntimeLike = {
  payments?: { config: PaymentsConfig };
  entrypoints: { snapshot: () => EntrypointDef[] };
};

type PaymentMiddlewareFactory = typeof paymentMiddleware;

type EntrypointPaymentKind = 'invoke' | 'stream';

export type CreateTanStackPaywallOptions = {
  runtime: RuntimeLike;
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

function buildEntrypointRoutes({
  entrypoints,
  payments,
  basePath,
  kind,
}: BuildRoutesParams): Record<string, RouteConfig> {
  const routes: Record<string, RouteConfig> = {};

  for (const entrypoint of entrypoints) {
    if (kind === 'stream' && !entrypoint.stream) continue;

    const network = entrypoint.network ?? payments.network;
    const price = resolvePrice(entrypoint, payments, kind);

    validatePaymentsConfig(payments, network, entrypoint.key);

    if (!network || !price) continue;

    const description =
      entrypoint.description ??
      `${entrypoint.key}${kind === 'stream' ? ' (stream)' : ''}`;

    const path = `${basePath}/entrypoints/${entrypoint.key}/${kind}`;

    const postRoute: RouteConfig = {
      accepts: {
        scheme: DEFAULT_SCHEME,
        payTo: payments.payTo,
        price,
        network,
      },
      description,
      mimeType: kind === 'stream' ? 'text/event-stream' : 'application/json',
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

  const baseFacilitator: FacilitatorConfig =
    facilitator ??
    ({ url: activePayments.facilitatorUrl } satisfies FacilitatorConfig);
  const resolvedFacilitator = addFacilitatorAuth(
    baseFacilitator,
    activePayments.facilitatorAuth
  );

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
      ? middlewareFactory(invokeRoutes, resolvedFacilitator, paywall)
      : undefined;

  const stream =
    Object.keys(streamRoutes).length > 0
      ? middlewareFactory(streamRoutes, resolvedFacilitator, paywall)
      : undefined;

  return { invoke, stream };
}
