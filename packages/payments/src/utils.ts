import type {
  PaymentsConfig,
  StripePaymentsConfig,
} from '@lucid-agents/types/payments';

/**
 * Creates PaymentsConfig from environment variables and optional overrides.
 *
 * @param configOverrides - Optional config overrides from agent-kit config
 * @returns PaymentsConfig resolved from env + overrides
 */
export function paymentsFromEnv(
  configOverrides?: Partial<PaymentsConfig>
): PaymentsConfig {
  const facilitatorUrl =
    configOverrides?.facilitatorUrl ??
    (process.env.FACILITATOR_URL ??
      process.env.PAYMENTS_FACILITATOR_URL) ??
    undefined;
  const network =
    configOverrides?.network ??
    (process.env.NETWORK ?? process.env.PAYMENTS_NETWORK) ??
    undefined;
  const facilitatorAuth =
    configOverrides?.facilitatorAuth ??
    process.env.FACILITOR_AUTH ??
    process.env.FACILITATOR_AUTH ??
    process.env.PAYMENTS_FACILITATOR_AUTH ??
    process.env.DREAMS_AUTH_TOKEN;

  const baseConfig = {
    facilitatorUrl: facilitatorUrl as PaymentsConfig['facilitatorUrl'],
    facilitatorAuth,
    network: network as PaymentsConfig['network'],
    policyGroups: configOverrides?.policyGroups,
    storage: configOverrides?.storage,
  };

  const stripeConfig = (configOverrides as { stripe?: StripePaymentsConfig })
    ?.stripe;
  const stripeSecretKey = stripeConfig?.secretKey ?? process.env.STRIPE_SECRET_KEY;
  const destinationMode = process.env.PAYMENTS_DESTINATION?.trim().toLowerCase();
  const useStripeMode = Boolean(stripeConfig) || destinationMode === 'stripe';

  if (useStripeMode) {
    return {
      ...baseConfig,
      stripe: {
        ...stripeConfig,
        secretKey: stripeSecretKey ?? '',
      },
    };
  }

  return {
    ...baseConfig,
    payTo:
      (configOverrides as { payTo?: PaymentsConfig extends { payTo: infer T } ? T : never })
        ?.payTo ?? ((process.env.PAYMENTS_RECEIVABLE_ADDRESS as any) ?? undefined),
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

export function createFacilitatorAuthHeaders(
  token?: string | null
): {
  verify: Record<string, string>;
  settle: Record<string, string>;
  supported: Record<string, string>;
} | undefined {
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

function parseHeaderJson(raw: string): PaymentRequiredHeaderDetails | undefined {
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
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

export function decodePaymentRequiredHeader(
  headerValue: string | null | undefined
): PaymentRequiredHeaderDetails | undefined {
  if (!headerValue) return undefined;
  const direct = parseHeaderJson(headerValue);
  if (direct) return direct;
  try {
    const decoded = Buffer.from(headerValue, 'base64').toString('utf-8');
    return parseHeaderJson(decoded);
  } catch {
    return undefined;
  }
}

/**
 * Extracts domain from a URL string or request headers.
 * @param urlOrOrigin - URL string or origin header value
 * @param referer - Optional referer header value
 * @returns Domain hostname or undefined
 */
export function extractSenderDomain(
  urlOrOrigin?: string | null,
  referer?: string | null
): string | undefined {
  if (urlOrOrigin) {
    try {
      return new URL(urlOrOrigin).hostname;
    } catch {
      // Invalid URL
    }
  }
  if (referer) {
    try {
      return new URL(referer).hostname;
    } catch {
      // Invalid referer
    }
  }
  return undefined;
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
    const decoded = JSON.parse(
      Buffer.from(paymentResponseHeader, 'base64').toString('utf-8')
    );
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
