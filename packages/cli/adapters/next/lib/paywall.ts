import { z } from 'zod';
import {
  createFacilitatorAuthHeaders,
  resolvePrice,
  resolvePayTo,
  validatePaymentsConfig,
  entrypointHasSIWx,
  buildSIWxExtensionDeclaration,
} from '@lucid-agents/payments';
import type { AgentRuntime, EntrypointDef } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import type {
  FacilitatorConfig,
  PaywallConfig,
  RouteConfig,
  RoutesConfig,
} from '@x402/core/server';
import { paymentMiddleware } from '@x402/next';

const DEFAULT_BASE_PATH = '/api/agent';

export type CreateNextPaywallOptions = {
  runtime: Pick<AgentRuntime, 'entrypoints' | 'payments'>;
  basePath?: string;
  payments?: PaymentsConfig;
  facilitator?: FacilitatorConfig;
  paywall?: PaywallConfig;
};

export type SIWxRouteConfig = {
  /** The entrypoint key */
  entrypointKey: string;
  /** The SIWX extension declaration to include in 402 responses */
  extensionFactory: (requestUrl: string) => Record<string, unknown>;
};

export type NextPaywallConfig = {
  middleware?: ReturnType<typeof paymentMiddleware>;
  matcher: string[];
  /** SIWX-enabled routes, keyed by path pattern */
  siwxRoutes?: Map<string, SIWxRouteConfig>;
};

type EntrypointPaymentKind = 'invoke' | 'stream';

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

function normalizeBasePath(path?: string) {
  if (!path) return DEFAULT_BASE_PATH;
  const sanitized = path.startsWith('/')
    ? path.replace(/\/+$/u, '')
    : `/${path.replace(/^\/+/u, '').replace(/\/+$/u, '')}`;
  return sanitized === '/' ? '' : sanitized;
}

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

    const requestSchema = entrypoint.input
      ? z.toJSONSchema(entrypoint.input)
      : undefined;
    const responseSchema =
      kind === 'invoke'
        ? entrypoint.output
          ? z.toJSONSchema(entrypoint.output)
          : undefined
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

function buildMatcher(basePath: string): string[] {
  return [`${basePath}/entrypoints/:path*`];
}

export function createNextPaywall({
  runtime,
  basePath,
  payments,
  facilitator,
  paywall,
}: CreateNextPaywallOptions): NextPaywallConfig {
  const activePayments = payments ?? runtime.payments?.config;
  if (!activePayments) {
    return { matcher: [] };
  }

  const normalizedBasePath = normalizeBasePath(basePath);
  const entrypoints = runtime.entrypoints.snapshot();

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

  const routes: RoutesConfig = { ...invokeRoutes, ...streamRoutes };
  const routeCount = Object.keys(routes).length;
  if (routeCount === 0) {
    return { matcher: [] };
  }

  const baseFacilitator: FacilitatorConfig =
    facilitator ??
    ({ url: activePayments.facilitatorUrl } satisfies FacilitatorConfig);
  const resolvedFacilitator = addFacilitatorAuth(
    baseFacilitator,
    activePayments.facilitatorAuth
  );

  const payTo = resolvePayTo(activePayments) as Parameters<
    typeof paymentMiddleware
  >[0];

  const middleware = paymentMiddleware(
    payTo,
    routes,
    resolvedFacilitator,
    paywall
  );

  // Build SIWX route map for entrypoints that have SIWX enabled
  const siwxRoutes = new Map<string, SIWxRouteConfig>();
  const siwxConfig = activePayments.siwx;

  for (const entrypoint of entrypoints) {
    if (!entrypointHasSIWx(entrypoint, siwxConfig)) continue;

    const kinds: EntrypointPaymentKind[] = ['invoke'];
    if (entrypoint.stream) kinds.push('stream');

    for (const kind of kinds) {
      const path = `${normalizedBasePath}/entrypoints/${entrypoint.key}/${kind}`;
      siwxRoutes.set(path, {
        entrypointKey: entrypoint.key,
        extensionFactory: (requestUrl: string) => {
          let hostname: string;
          try {
            hostname = new URL(requestUrl).hostname;
          } catch {
            hostname = 'localhost';
          }
          return buildSIWxExtensionDeclaration({
            resourceUri: requestUrl,
            domain: hostname,
            statement:
              entrypoint.siwx?.statement ?? siwxConfig?.defaultStatement,
            expirationSeconds: siwxConfig?.expirationSeconds,
          });
        },
      });
    }
  }

  return {
    middleware,
    matcher: buildMatcher(normalizedBasePath),
    ...(siwxRoutes.size > 0 ? { siwxRoutes } : {}),
  };
}
