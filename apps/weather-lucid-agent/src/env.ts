export interface AppEnv {
  PORT: number;
  PAYMENT_HEADER: string;
  PRICE_USD: number;
  WEATHER_TIMEOUT_MS: number;
  X402_ALLOW_STATIC_FALLBACK: boolean;
  X402_STATIC_TOKENS: Set<string>;
  X402_SHARED_SECRET: string | null;
  X402_TOKEN_TTL_SECONDS: number;
}

const FIXED_PRICE_USD = 0.001;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return fallback;
}

function parseCsvToSet(value: string | undefined): Set<string> {
  if (!value || value.trim().length === 0) return new Set<string>();
  const tokens = value
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  return new Set(tokens);
}

export function loadEnv(
  rawEnv: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): AppEnv {
  const isProd = (rawEnv.NODE_ENV ?? "").toLowerCase() === "production";
  const defaultStaticToken = isProd ? "" : "dev-paid-token";
  const staticTokens = parseCsvToSet(rawEnv.X402_STATIC_TOKENS ?? defaultStaticToken);

  return {
    PORT: parsePositiveInt(rawEnv.PORT, 3000),
    PAYMENT_HEADER: (rawEnv.PAYMENT_HEADER ?? "x402-payment").trim() || "x402-payment",
    PRICE_USD: FIXED_PRICE_USD,
    WEATHER_TIMEOUT_MS: parsePositiveInt(rawEnv.WEATHER_TIMEOUT_MS, 8000),
    X402_ALLOW_STATIC_FALLBACK: parseBoolean(rawEnv.X402_ALLOW_STATIC_FALLBACK, !isProd),
    X402_STATIC_TOKENS: staticTokens,
    X402_SHARED_SECRET: rawEnv.X402_SHARED_SECRET?.trim() || null,
    X402_TOKEN_TTL_SECONDS: parsePositiveInt(rawEnv.X402_TOKEN_TTL_SECONDS, 300)
  };
}