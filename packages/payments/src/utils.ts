import type { PaymentsConfig } from '@lucid-agents/types/payments';

/**
 * Creates PaymentsConfig from environment variables and optional overrides.
 *
 * @param configOverrides - Optional config overrides from agent-kit config
 * @returns PaymentsConfig resolved from env + overrides
 */
export function paymentsFromEnv(
  configOverrides?: Partial<PaymentsConfig>
): PaymentsConfig {
  const baseConfig: PaymentsConfig = {
    payTo: configOverrides?.payTo ?? (process.env.PAYMENTS_RECEIVABLE_ADDRESS as any),
    facilitatorUrl: configOverrides?.facilitatorUrl ?? (process.env.FACILITATOR_URL as any),
    network: configOverrides?.network ?? (process.env.NETWORK as any),
  };

  return {
    ...baseConfig,
    ...configOverrides,
  };
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
 * Extracts payer address from X-PAYMENT-RESPONSE header.
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

