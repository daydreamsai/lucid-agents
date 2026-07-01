export interface AppConfig {
  port: number;
  newsApiKey: string;
  x402PriceUsd: string;
  x402Secret: string;
  x402MaxSkewSeconds: number;
  x402StaticValidHeader?: string;
}

// Optional baked key for quick free-tier usage on newsapi.org.
// Replace this with your real key if you want it hardcoded.
const BAKED_NEWS_API_KEY = "PASTE_NEWSAPI_KEY_HERE";

function parsePort(raw: string | undefined): number {
  if (!raw) return 3000;
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT value "${raw}"`);
  }
  return port;
}

function parseSkewSeconds(raw: string | undefined): number {
  if (!raw) return 300;
  const skew = Number.parseInt(raw, 10);
  if (!Number.isInteger(skew) || skew <= 0) {
    throw new Error(`Invalid X402_MAX_SKEW_SECONDS value "${raw}"`);
  }
  return skew;
}

function resolveNewsApiKey(): string {
  const envKey = process.env.NEWS_API_KEY?.trim();
  const key = envKey && envKey.length > 0 ? envKey : BAKED_NEWS_API_KEY;

  if (!key || key === "PASTE_NEWSAPI_KEY_HERE") {
    throw new Error(
      "Missing News API key. Set NEWS_API_KEY or replace BAKED_NEWS_API_KEY in src/config.ts.",
    );
  }

  return key;
}

export function loadConfig(): AppConfig {
  return {
    port: parsePort(process.env.PORT),
    newsApiKey: resolveNewsApiKey(),
    x402PriceUsd: process.env.X402_PRICE_USD?.trim() || "0.001",
    x402Secret: process.env.X402_SECRET?.trim() || "dev-x402-secret-change-me",
    x402MaxSkewSeconds: parseSkewSeconds(process.env.X402_MAX_SKEW_SECONDS),
    x402StaticValidHeader: process.env.X402_VALID_PAYMENT_HEADER?.trim() || undefined,
  };
}