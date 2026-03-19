import type { EntrypointDef } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import type { SIWxConfig } from '@lucid-agents/types/siwx';
import type { SIWxStorage } from '@lucid-agents/payments';
import {
  createFacilitatorAuthHeaders,
  resolvePrice,
  resolvePayTo,
  validatePaymentsConfig,
  entrypointHasSIWx,
} from '@lucid-agents/payments';
import type {
  FacilitatorConfig,
  PaywallConfig,
  RouteConfig,
} from '@x402/core/server';
import {
  paymentMiddleware,
  type TanStackRequestMiddleware,
  type SIWxMiddlewareConfig,
} from './x402-paywall';

const DEFAULT_SCHEME = 'exact';

type RuntimeLike = {
  payments?: {
    config: PaymentsConfig;
    siwxStorage?: SIWxStorage;
    siwxConfig?: SIWxConfig;
  };
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
  /** Override SIWX storage (defaults to runtime.payments.siwxStorage) */
  siwxStorage?: SIWxStorage;
  /** Override SIWX config (defaults to runtime.payments.siwxConfig) */
  siwxConfig?: SIWxConfig;
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
  siwxConfig?: SIWxConfig;
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
  siwxConfig,
}: BuildRoutesParams): Record<string, RouteConfig> {
  const routes: Record<string, RouteConfig> = {};
  const payTo = resolvePayTo(payments);

  for (const entrypoint of entrypoints) {
    if (kind === 'stream' && !entrypoint.stream) continue;

    const network = entrypoint.network ?? payments.network;
    const price = resolvePrice(entrypoint, payments, kind);

    // For auth-only SIWX routes, we still need to register the route
    // even without a price (they won't have payment requirements)
    const isAuthOnly = entrypoint.siwx?.authOnly === true;

    if (!isAuthOnly) {
      validatePaymentsConfig(payments, network, entrypoint.key);
      if (!network || !price) continue;
    } else if (!network) {
      continue;
    }

    const description =
      entrypoint.description ??
      `${entrypoint.key}${kind === 'stream' ? ' (stream)' : ''}`;

    const path = `${basePath}/entrypoints/${entrypoint.key}/${kind}`;

    if (isAuthOnly && !price) {
      // Auth-only routes without a price: register with a zero/no-payment route
      // The SIWX middleware handles access control
      const authRoute: RouteConfig = {
        accepts: {
          scheme: DEFAULT_SCHEME,
          payTo: payTo as any,
          price: '0',
          network: network!,
        },
        description,
        mimeType: kind === 'stream' ? 'text/event-stream' : 'application/json',
      };
      routes[`POST ${path}`] = authRoute;
      routes[`GET ${path}`] = authRoute;
      continue;
    }

    const postRoute: RouteConfig = {
      accepts: {
        scheme: DEFAULT_SCHEME,
        payTo: payTo as any,
        price: price!,
        network: network!,
      },
      description,
      mimeType: kind === 'stream' ? 'text/event-stream' : 'application/json',
    };

    const getRoute: RouteConfig = {
      accepts: {
        scheme: DEFAULT_SCHEME,
        payTo: payTo as any,
        price: price!,
        network: network!,
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
  siwxStorage,
  siwxConfig,
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

  // Resolve SIWX config
  const resolvedSiwxStorage =
    siwxStorage ?? runtime.payments?.siwxStorage;
  const resolvedSiwxConfig =
    siwxConfig ?? runtime.payments?.siwxConfig ?? activePayments.siwx;

  // Validate fail-closed: authOnly entrypoints require SIWX runtime
  const hasSiwxRuntime = resolvedSiwxStorage && resolvedSiwxConfig?.enabled;
  for (const ep of entrypoints) {
    if (ep.siwx?.authOnly && !hasSiwxRuntime) {
      throw new Error(
        `Entrypoint "${ep.key}" declares authOnly but SIWX runtime is not configured. ` +
        `Enable SIWX in payments config or remove authOnly from this entrypoint.`
      );
    }
  }

  const siwxMiddlewareConfig: SIWxMiddlewareConfig | undefined =
    resolvedSiwxStorage && resolvedSiwxConfig?.enabled
      ? {
          siwxStorage: resolvedSiwxStorage,
          siwxConfig: resolvedSiwxConfig,
          entrypoints,
          basePath: normalizedBasePath,
        }
      : undefined;

  const invokeRoutes = buildEntrypointRoutes({
    entrypoints,
    payments: activePayments,
    basePath: normalizedBasePath,
    kind: 'invoke',
    siwxConfig: resolvedSiwxConfig,
  });

  const streamRoutes = buildEntrypointRoutes({
    entrypoints,
    payments: activePayments,
    basePath: normalizedBasePath,
    kind: 'stream',
    siwxConfig: resolvedSiwxConfig,
  });

  const invoke =
    Object.keys(invokeRoutes).length > 0
      ? middlewareFactory(invokeRoutes, resolvedFacilitator, paywall, siwxMiddlewareConfig)
      : undefined;

  const stream =
    Object.keys(streamRoutes).length > 0
      ? middlewareFactory(streamRoutes, resolvedFacilitator, paywall, siwxMiddlewareConfig)
      : undefined;

  return { invoke, stream };
}
