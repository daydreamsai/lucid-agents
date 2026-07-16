import type {
  PaymentsConfig,
  StripePaymentsConfig,
} from '@lucid-agents/types/payments';
import { normalizePaymentNetwork } from './validation';
import { decodeBase64Utf8, encodeBase64Utf8 } from './base64';

/**
 * Creates PaymentsConfig from environment variables and optional overrides.
 *
 * @param configOverrides - Optional config overrides from agent-kit config
 * @returns PaymentsConfig resolved from env + overrides, or undefined when
 * no payment configuration was supplied
 */
export function paymentsFromEnv(
  configOverrides?: Partial<PaymentsConfig>,
  env: Record<string, string | undefined> = typeof process === 'undefined'
    ? {}
    : process.env
): PaymentsConfig | undefined {
  const facilitatorUrl =
    configOverrides?.facilitatorUrl ??
    env.FACILITATOR_URL ??
    env.PAYMENTS_FACILITATOR_URL ??
    undefined;
  const network =
    configOverrides?.network ??
    env.NETWORK ??
    env.PAYMENTS_NETWORK ??
    undefined;
  const facilitatorAuth =
    configOverrides?.facilitatorAuth ??
    env.FACILITOR_AUTH ??
    env.FACILITATOR_AUTH ??
    env.PAYMENTS_FACILITATOR_AUTH ??
    env.DREAMS_AUTH_TOKEN;

  const baseConfig = {
    facilitatorUrl: facilitatorUrl as PaymentsConfig['facilitatorUrl'],
    facilitatorAuth,
    network: network
      ? normalizePaymentNetwork(network)
      : (network as PaymentsConfig['network']),
    policyGroups: configOverrides?.policyGroups,
    storage: configOverrides?.storage,
  };

  const stripeConfig = (configOverrides as { stripe?: StripePaymentsConfig })
    ?.stripe;
  const stripeSecretKey = stripeConfig?.secretKey ?? env.STRIPE_SECRET_KEY;
  const destinationMode = env.PAYMENTS_DESTINATION?.trim().toLowerCase();
  const useStripeMode = Boolean(stripeConfig) || destinationMode === 'stripe';
  const explicitKeys = Object.keys(configOverrides ?? {});
  const payToOverride = (
    configOverrides as {
      payTo?: PaymentsConfig extends { payTo: infer T } ? T : never;
    }
  )?.payTo;
  const payToEnv = env.PAYMENTS_RECEIVABLE_ADDRESS as
    | (PaymentsConfig extends { payTo: infer T } ? T : never)
    | undefined;
  const hasConfiguration =
    explicitKeys.length > 0 ||
    Boolean(facilitatorUrl || network || payToEnv || destinationMode);

  if (!hasConfiguration) return undefined;

  if (useStripeMode) {
    const resolvedStripeSecretKey = stripeSecretKey?.trim();
    if (!resolvedStripeSecretKey) {
      throw new Error(
        'Missing Stripe secret: set STRIPE_SECRET_KEY or override'
      );
    }

    return {
      ...baseConfig,
      stripe: {
        ...stripeConfig,
        secretKey: resolvedStripeSecretKey,
      },
    };
  }

  return {
    ...baseConfig,
    payTo: payToOverride ?? payToEnv ?? undefined,
  } as PaymentsConfig;
}

function normalizeBearerToken(token?: string | null): string | undefined {
  if (!token) return undefined;

  const trimmed = token.trim();
  if (!trimmed) return undefined;

  if (/^bearer\s+/i.test(trimmed)) {
    return `Bearer ${trimmed.replace(/^bearer\s+/i, '')}`;
  }

  return `Bearer ${trimmed}`;
}

export function createFacilitatorAuthHeaders(token?: string | null):
  | {
      verify: Record<string, string>;
      settle: Record<string, string>;
      supported: Record<string, string>;
    }
  | undefined {
  const authorization = normalizeBearerToken(token);
  if (!authorization) {
    return undefined;
  }

  return {
    verify: { Authorization: authorization },
    settle: { Authorization: authorization },
    supported: { Authorization: authorization },
  };
}

export type PaymentRequiredHeaderDetails = {
  price?: string;
  payTo?: string;
  network?: string;
  facilitatorUrl?: string;
  x402Version?: number;
};

function parseHeaderJson(
  raw: string
): PaymentRequiredHeaderDetails | undefined {
  try {
    return JSON.parse(raw) as PaymentRequiredHeaderDetails;
  } catch {
    return undefined;
  }
}

export function encodePaymentRequiredHeader(
  details: PaymentRequiredHeaderDetails
): string {
  const payload = {
    x402Version: 2,
    ...details,
  };
  return encodeBase64Utf8(JSON.stringify(payload));
}

export function decodePaymentRequiredHeader(
  headerValue: string | null | undefined
): PaymentRequiredHeaderDetails | undefined {
  if (!headerValue) return undefined;
  const direct = parseHeaderJson(headerValue);
  if (direct) return direct;
  try {
    const decoded = decodeBase64Utf8(headerValue);
    return parseHeaderJson(decoded);
  } catch {
    return undefined;
  }
}

/**
 * Extracts payer address from PAYMENT-RESPONSE header (v2) or legacy header.
 * @param paymentResponseHeader - Base64-encoded JSON payment response header
 * @returns Payer address or undefined
 */
export function extractPayerAddress(
  paymentResponseHeader: string | null | undefined
): string | undefined {
  if (!paymentResponseHeader) return undefined;

  try {
    const decoded = JSON.parse(decodeBase64Utf8(paymentResponseHeader));
    return decoded.payer;
  } catch {
    return undefined;
  }
}

/**
 * Parses payment amount from price string (assumes USDC with 6 decimals).
 * @param price - Price string (e.g., "1.5" for $1.50)
 * @returns Amount in base units (with 6 decimals), or undefined if invalid
 */
export function parsePriceAmount(price: string): bigint | undefined {
  try {
    const priceNum = parseFloat(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) return undefined;
    return BigInt(Math.floor(priceNum * 1_000_000));
  } catch {
    return undefined;
  }
}
