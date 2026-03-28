export interface AppEnv {
  PORT: number;
  SENTIMENT_API_URL: string;
  MEANINGCLOUD_API_KEY: string;
  X402_PRICE_USD: string;
  X402_PAYMENT_HEADER: string;
  X402_PAYMENT_TOKEN: string;
  X402_NETWORK: string;
}

function parsePort(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export const env: AppEnv = {
  PORT: parsePort(process.env.PORT, 3000),
  SENTIMENT_API_URL: process.env.SENTIMENT_API_URL ?? "",
  MEANINGCLOUD_API_KEY: process.env.MEANINGCLOUD_API_KEY ?? "",
  X402_PRICE_USD: process.env.X402_PRICE_USD ?? "0.001",
  X402_PAYMENT_HEADER: (process.env.X402_PAYMENT_HEADER ?? "x402-payment").toLowerCase(),
  X402_PAYMENT_TOKEN: process.env.X402_PAYMENT_TOKEN ?? "dev_paid_token",
  X402_NETWORK: process.env.X402_NETWORK ?? "base"
};

export function assertStartupConfig(): void {
  const missing: string[] = [];

  if (!env.SENTIMENT_API_URL) {
    missing.push("SENTIMENT_API_URL");
  }
  if (!env.MEANINGCLOUD_API_KEY) {
    missing.push("MEANINGCLOUD_API_KEY");
  }
  if (!env.X402_PAYMENT_TOKEN) {
    missing.push("X402_PAYMENT_TOKEN");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}