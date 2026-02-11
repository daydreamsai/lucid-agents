import type { StripePaymentsConfig } from '@lucid-agents/types/payments';

const DEFAULT_STRIPE_API_BASE_URL = 'https://api.stripe.com';
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

function parseBaseUnits(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (/^\d+$/.test(trimmed)) {
    const asInt = Number.parseInt(trimmed, 10);
    return Number.isFinite(asInt) && asInt > 0 ? asInt : undefined;
  }

  const numeric = trimmed.replace(/[^0-9.]/g, '');
  if (!numeric || numeric === '.') return undefined;
  const asUsd = Number.parseFloat(numeric);
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

function readBaseDepositAddress(payload: StripePaymentIntentResponse): string {
  const address =
    payload.next_action?.crypto_collect_deposit_details?.deposit_addresses
      ?.base?.address;

  if (!address || typeof address !== 'string') {
    throw new Error(
      'PaymentIntent did not return expected crypto deposit details for base'
    );
  }

  return address;
}

export async function createStripePayToAddress(
  stripe: StripePaymentsConfig,
  context: Record<string, unknown>
): Promise<string> {
  const secretKey = stripe.secretKey?.trim();
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is required for Stripe payTo resolution');
  }

  const amountBaseUnits = resolveAmountBaseUnits(context);
  const amountInCents = toCentsFromBaseUnits(amountBaseUnits);
  const stripeUrl = `${(stripe.apiBaseUrl ?? DEFAULT_STRIPE_API_BASE_URL).replace(/\/+$/u, '')}/v1/payment_intents`;

  const body = new URLSearchParams();
  body.set('amount', String(amountInCents));
  body.set('currency', 'usd');
  body.append('payment_method_types[]', 'crypto');
  body.set('payment_method_data[type]', 'crypto');
  body.set('payment_method_options[crypto][mode]', 'custom');
  body.set('confirm', 'true');

  const headers = new Headers({
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  });
  if (stripe.apiVersion) {
    headers.set('Stripe-Version', stripe.apiVersion);
  }

  const response = await fetch(stripeUrl, {
    method: 'POST',
    headers,
    body: body.toString(),
  });

  let payload: StripePaymentIntentResponse | undefined;
  try {
    payload = (await response.json()) as StripePaymentIntentResponse;
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    const errorMessage =
      payload?.error?.message ??
      `Stripe request failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  if (!payload) {
    throw new Error('Stripe returned an empty response payload');
  }

  return readBaseDepositAddress(payload);
}

