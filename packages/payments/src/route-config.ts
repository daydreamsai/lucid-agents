import type { RoutesConfig, RouteConfig } from '@x402/core/server';
import type { EntrypointDef } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import { resolvePrice } from './pricing';

export type PaymentRouteKind = 'invoke' | 'stream';

/**
 * HTTP request context passed to dynamic price functions.
 * Matches x402's HTTPRequestContext.
 */
export type PriceContext = {
  adapter: {
    getHeader(name: string): string | undefined;
    getMethod(): string;
    getPath(): string;
    getUrl(): string;
    getQueryParams?(): Record<string, string | string[]>;
    getQueryParam?(name: string): string | string[] | undefined;
    getBody?(): unknown;
  };
  path: string;
  method: string;
};

/**
 * Price value - can be a static string like "$0.01" or a number.
 */
export type PriceValue = string | number;

/**
 * Dynamic price function that receives request context.
 */
export type DynamicPriceFn = (context: PriceContext) => PriceValue | Promise<PriceValue>;

/**
 * Price can be static or dynamic (function).
 */
export type Price = PriceValue | DynamicPriceFn;

/**
 * Payment option for a route - matches x402's PaymentOption.
 */
export type PaymentAccept = {
  scheme: string;
  price: Price;
  network: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: Record<string, unknown>;
};

export type PaymentRouteConfig = {
  accepts: PaymentAccept | PaymentAccept[];
  description?: string;
  mimeType?: string;
};

/**
 * Builds a payment accept object for the x402 route config.
 * Supports both static prices (string) and dynamic prices (function).
 */
export function buildPaymentAccept(
  payments: PaymentsConfig,
  price: Price,
  network: string
): PaymentAccept {
  return {
    scheme: 'exact',
    price,
    network,
    payTo: payments.payTo as string,
  };
}

/**
 * Builds a route config for a single entrypoint.
 * Returns the accepts array and metadata for the route.
 * Supports both static and dynamic pricing.
 */
export function buildRouteConfig(
  entrypoint: EntrypointDef,
  payments: PaymentsConfig,
  kind: PaymentRouteKind
): PaymentRouteConfig | null {
  const network = entrypoint.network ?? payments.network;
  const price = resolvePrice(entrypoint, payments, kind);

  if (!price || !network || !payments.payTo) {
    return null;
  }

  const description =
    entrypoint.description ??
    `${entrypoint.key}${kind === 'stream' ? ' (stream)' : ''}`;

  const mimeType = kind === 'stream' ? 'text/event-stream' : 'application/json';

  return {
    accepts: buildPaymentAccept(payments, price, network),
    description,
    mimeType,
  };
}

/**
 * Builds routes config for POST and GET methods on a path.
 * Returns a RoutesConfig object ready for the payment middleware.
 */
export function buildRoutesConfig(
  path: string,
  entrypoint: EntrypointDef,
  payments: PaymentsConfig,
  kind: PaymentRouteKind
): RoutesConfig | null {
  const routeConfig = buildRouteConfig(entrypoint, payments, kind);

  if (!routeConfig) {
    return null;
  }

  const routes: Record<string, PaymentRouteConfig> = {};
  routes[`POST ${path}`] = routeConfig;
  routes[`GET ${path}`] = {
    ...routeConfig,
    mimeType: 'application/json',
  };

  return routes as unknown as RoutesConfig;
}
