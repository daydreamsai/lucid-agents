import * as LucidPayments from "@lucid-agents/payments";

export interface X402Config {
  priceUsd: number;
  currency: string;
  recipient: string;
  headerName: string;
  paymentToken: string;
}

const DEFAULT_PRICE_USD = 0.0005;

function asPositiveNumber(input: string | undefined, fallback: number): number {
  if (!input) {
    return fallback;
  }
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function loadX402Config(env: Record<string, string | undefined> = Bun.env): X402Config {
  return {
    priceUsd: asPositiveNumber(env.CONVERSION_PRICE, DEFAULT_PRICE_USD),
    currency: (env.X402_CURRENCY ?? "USD").trim(),
    recipient: (env.X402_RECIPIENT ?? "unit-converter-agent").trim(),
    headerName: (env.X402_HEADER ?? "x402-payment").trim().toLowerCase(),
    paymentToken: (env.X402_PAYMENT_TOKEN ?? "dev-paid-token").trim()
  };
}

function extractAuthorizationToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (!auth) {
    return null;
  }

  const [scheme, token] = auth.split(/\s+/, 2);
  if (!token) {
    return null;
  }

  if (/^bearer$/i.test(scheme) || /^x402$/i.test(scheme)) {
    return token.trim();
  }

  return null;
}

function extractPaymentToken(request: Request, configuredHeader: string): string | null {
  const direct = request.headers.get(configuredHeader);
  if (direct?.trim()) {
    return direct.trim();
  }

  const fallbackHeaders = ["x402-payment", "x402", "x-payment"];
  for (const header of fallbackHeaders) {
    const value = request.headers.get(header);
    if (value?.trim()) {
      return value.trim();
    }
  }

  return extractAuthorizationToken(request);
}

function tokenMatchesAllowed(token: string | null, configured: string): boolean {
  if (!token) {
    return false;
  }

  const validTokens = configured
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  if (validTokens.length === 0) {
    return false;
  }

  return validTokens.includes(token);
}

function coercePaymentResult(result: unknown): boolean | undefined {
  if (typeof result === "boolean") {
    return result;
  }

  if (typeof result === "object" && result !== null) {
    const obj = result as Record<string, unknown>;
    for (const key of ["valid", "ok", "paid", "success"]) {
      if (typeof obj[key] === "boolean") {
        return obj[key] as boolean;
      }
    }
  }

  return undefined;
}

async function verifyViaLucidPayments(request: Request, config: X402Config): Promise<boolean | undefined> {
  const api = LucidPayments as unknown as Record<string, unknown>;
  const verifierNames = ["verifyX402Payment", "verifyPayment", "validatePayment", "isPaymentValid", "checkPayment"];

  for (const verifierName of verifierNames) {
    const candidate = api[verifierName];
    if (typeof candidate !== "function") {
      continue;
    }

    const verifier = candidate as (...args: unknown[]) => unknown;

    const attempts: unknown[][] = [
      [request],
      [{ request }],
      [request, config.priceUsd],
      [{ request, amount: config.priceUsd, currency: config.currency }]
    ];

    for (const args of attempts) {
      try {
        const result = await Promise.resolve(verifier(...args));
        const normalized = coercePaymentResult(result);
        if (typeof normalized === "boolean") {
          return normalized;
        }
      } catch {
        // Try next signature/function.
      }
    }
  }

  return undefined;
}

export async function isPaidRequest(request: Request, config: X402Config): Promise<boolean> {
  const packageDecision = await verifyViaLucidPayments(request, config);
  if (typeof packageDecision === "boolean") {
    return packageDecision;
  }

  const token = extractPaymentToken(request, config.headerName);
  return tokenMatchesAllowed(token, config.paymentToken);
}

function json(data: unknown, status: number, headers: HeadersInit = {}): Response {
  const merged = new Headers(headers);
  if (!merged.has("content-type")) {
    merged.set("content-type", "application/json; charset=utf-8");
  }
  if (!merged.has("cache-control")) {
    merged.set("cache-control", "no-store");
  }
  return new Response(JSON.stringify(data), { status, headers: merged });
}

export function paymentRequiredResponse(config: X402Config, requestUrl: string): Response {
  const payload = {
    error: "Payment Required",
    message: `This endpoint costs $${config.priceUsd.toFixed(4)} per conversion.`,
    x402: {
      amount: config.priceUsd,
      currency: config.currency,
      recipient: config.recipient,
      paymentHeader: config.headerName,
      endpoint: "/convert",
      request: requestUrl
    }
  };

  return json(payload, 402, {
    "x402-price": String(config.priceUsd),
    "x402-currency": config.currency,
    "x402-recipient": config.recipient,
    "x402-header": config.headerName
  });
}