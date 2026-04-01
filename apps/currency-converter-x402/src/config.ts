export interface AppConfig {
  port: number;
  frankfurterApiBase: string;
  priceUsd: number;
  paymentSecret: string;
  paymentTtlSeconds: number;
  paymentRealm: string;
  fxTimeoutMs: number;
}

function env(name: string): string | undefined {
  return process.env[name];
}

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) return fallback;
  return parsed;
}

function parsePositiveNumber(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export const appConfig: AppConfig = {
  port: parsePort(env("PORT"), 3000),
  frankfurterApiBase: env("FRANKFURTER_API_BASE") ?? "https://api.frankfurter.app",
  priceUsd: parsePositiveNumber(env("X402_PRICE_USD"), 0.001),
  paymentSecret: env("PAYMENT_SECRET") ?? "dev-only-change-me",
  paymentTtlSeconds: parsePositiveNumber(env("PAYMENT_TTL_SECONDS"), 300),
  paymentRealm: env("PAYMENT_REALM") ?? "currency-converter",
  fxTimeoutMs: parsePositiveNumber(env("FX_TIMEOUT_MS"), 8000)
};