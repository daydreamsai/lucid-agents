export interface AppConfig {
  readonly port: number;
  readonly priceUsd: number;
  readonly paymentHeaderName: string;
  readonly fallbackPaymentToken: string;
  readonly validTokens: readonly string[];
  readonly sentimentApiEndpoint: string;
  readonly sentimentApiKey: string;
  readonly sentimentApiLang: string;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseTokens(csv: string | undefined): string[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

export const config: AppConfig = {
  port: parseNumber(process.env.PORT, 3000),
  priceUsd: parseNumber(process.env.X402_PRICE_USD, 0.001),
  paymentHeaderName: (process.env.X402_PAYMENT_HEADER_NAME ?? "x402-payment").toLowerCase(),
  fallbackPaymentToken: (process.env.X402_TEST_TOKEN ?? "demo-valid-payment").trim(),
  validTokens: parseTokens(process.env.X402_VALID_TOKENS),
  sentimentApiEndpoint: (process.env.SENTIMENT_API_ENDPOINT ?? "").trim(),
  sentimentApiKey: (process.env.SENTIMENT_API_KEY ?? "").trim(),
  sentimentApiLang: (process.env.SENTIMENT_API_LANG ?? "en").trim()
};