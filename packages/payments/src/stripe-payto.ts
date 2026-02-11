import type { StripePaymentsConfig } from '@lucid-agents/types/payments';
import Stripe from 'stripe';

const DEFAULT_USDC_BASE_UNITS = 10_000; // $0.01 in 6-decimal USDC
const USDC_BASE_UNITS_PER_CENT = 10_000;

type StripePaymentIntentResponse = {
  id?: string;
  next_action?: {
    crypto_collect_deposit_details?: {
      deposit_addresses?: Record<
        string,
        {
          address?: string;
        }
      >;
    };
  };
  error?: {
    message?: string;
  };
};

type StripeApiBaseOverride = {
  host: string;
  port?: number;
  protocol: 'http' | 'https';
};

/**
 * Parses payment amounts to USDC base units (6 decimals).
 *
 * Convention:
 * - `string` values are interpreted as USD decimals (e.g. "1.23" => 1_230_000).
 * - `number` values are treated as already-normalized base units for backwards
 *   compatibility with internal callers that may pass precomputed amounts.
 */
function parseBaseUnits(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const normalized = trimmed.replace(/[$,\s]/g, '');
  if (!normalized || normalized === '.') return undefined;
  if (!/^\d*\.?\d+$/u.test(normalized)) return undefined;

  const asUsd = Number.parseFloat(normalized);
  if (!Number.isFinite(asUsd) || asUsd <= 0) return undefined;
  return Math.floor(asUsd * 1_000_000);
}

function resolveAmountBaseUnits(context: Record<string, unknown>): number {
  const fromContext =
    parseBaseUnits(context.price) ??
    parseBaseUnits(context.amount) ??
    parseBaseUnits(context.maxAmountRequired);
  return fromContext ?? DEFAULT_USDC_BASE_UNITS;
}

function toCentsFromBaseUnits(amountBaseUnits: number): number {
  return Math.max(1, Math.round(amountBaseUnits / USDC_BASE_UNITS_PER_CENT));
}

function readBaseDepositAddress(payload: unknown): string {
  const normalized = payload as StripePaymentIntentResponse;
  const address =
    normalized.next_action?.crypto_collect_deposit_details?.deposit_addresses
      ?.base?.address;

  if (!address || typeof address !== 'string') {
    throw new Error(
      'PaymentIntent did not return expected crypto deposit details for base'
    );
  }

  return address;
}

function parseStripeApiBaseUrl(apiBaseUrl: string): StripeApiBaseOverride {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(apiBaseUrl);
  } catch {
    throw new Error(`Invalid Stripe apiBaseUrl: ${apiBaseUrl}`);
  }

  if (
    parsedUrl.pathname !== '/' ||
    parsedUrl.search.length > 0 ||
    parsedUrl.hash.length > 0
  ) {
    throw new Error(
      'Stripe apiBaseUrl must include only protocol, host, and optional port'
    );
  }

  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    throw new Error(
      `Unsupported Stripe apiBaseUrl protocol: ${parsedUrl.protocol}`
    );
  }

  const port = parsedUrl.port ? Number.parseInt(parsedUrl.port, 10) : undefined;
  if (typeof port === 'number' && Number.isNaN(port)) {
    throw new Error(`Invalid Stripe apiBaseUrl port: ${parsedUrl.port}`);
  }

  return {
    host: parsedUrl.hostname,
    port,
    protocol: parsedUrl.protocol === 'https:' ? 'https' : 'http',
  };
}

function createStripeClient(
  stripeConfig: StripePaymentsConfig,
  secretKey: string
): Stripe {
  const config: Stripe.StripeConfig = {};
  if (stripeConfig.apiVersion) {
    config.apiVersion =
      stripeConfig.apiVersion as unknown as Stripe.StripeConfig['apiVersion'];
  }

  if (stripeConfig.apiBaseUrl) {
    const override = parseStripeApiBaseUrl(stripeConfig.apiBaseUrl);
    config.host = override.host;
    config.port = override.port;
    config.protocol = override.protocol;
  }

  return new Stripe(secretKey, config);
}

export async function createStripePayToAddress(
  stripe: StripePaymentsConfig,
  context: Record<string, unknown>
): Promise<string> {
  const secretKey = stripe.secretKey?.trim();
  if (!secretKey) {
    throw new Error(
      'STRIPE_SECRET_KEY is required for Stripe payTo resolution'
    );
  }

  const amountBaseUnits = resolveAmountBaseUnits(context);
  const amountInCents = toCentsFromBaseUnits(amountBaseUnits);
  const stripeClient = createStripeClient(stripe, secretKey);

  try {
    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      payment_method_types: ['crypto'],
      payment_method_data: { type: 'crypto' },
      confirm: true,
      // This beta option is required for destination-mode crypto intents.
      payment_method_options: {
        crypto: { mode: 'custom' },
      } as unknown as Stripe.PaymentIntentCreateParams.PaymentMethodOptions,
    });

    return readBaseDepositAddress(paymentIntent);
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError && error.message) {
      throw new Error(error.message);
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error('Stripe request failed with an unknown error');
  }
}
