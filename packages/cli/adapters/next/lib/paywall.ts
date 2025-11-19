import type { AgentHttpRuntime } from '@lucid-agents/core';
import { toJsonSchemaOrUndefined } from '@lucid-agents/core';
import { resolvePrice, validatePaymentsConfig } from '@lucid-agents/payments';
import type { EntrypointDef } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import type {
  FacilitatorConfig,
  PaywallConfig,
  RouteConfig,
  RoutesConfig,
} from 'x402/types';
import { paymentMiddleware } from 'x402-next';

const DEFAULT_BASE_PATH = '/api/agent';

export type CreateNextPaywallOptions = {
  runtime: Pick<AgentHttpRuntime, 'snapshotEntrypoints' | 'payments'>;
  basePath?: string;
  payments?: PaymentsConfig;
  facilitator?: FacilitatorConfig;
  paywall?: PaywallConfig;
};

export type NextPaywallConfig = {
  middleware?: ReturnType<typeof paymentMiddleware>;
  matcher: string[];
};

type EntrypointPaymentKind = 'invoke' | 'stream';

type BuildRoutesParams = {
  entrypoints: EntrypointDef[];
  payments: PaymentsConfig;
  basePath: string;
  kind: EntrypointPaymentKind;
};

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

  const resolvedFacilitator: FacilitatorConfig =
    facilitator ??
    ({ url: activePayments.facilitatorUrl } satisfies FacilitatorConfig);

  const payTo = activePayments.payTo as Parameters<typeof paymentMiddleware>[0];

  const middleware = paymentMiddleware(
    payTo,
    routes,
    resolvedFacilitator,
    paywall
  );

  return {
    middleware,
    matcher: buildMatcher(normalizedBasePath),
  };
}
