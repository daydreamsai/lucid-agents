import * as LucidHttp from "@lucid-agents/http";
import * as LucidPayments from "@lucid-agents/payments";

const APP_NAME = "currency-converter-x402";
const CURRENCY_CODE_REGEX = /^[A-Z]{3}$/;
const PAYMENT_HEADER_NAMES = [
  "x402-payment",
  "x-payment",
  "x-402-payment",
  "payment",
];

const PORT = parseIntegerEnv("PORT", 3000);
const REQUEST_TIMEOUT_MS = parseIntegerEnv("REQUEST_TIMEOUT_MS", 8000);
const FX_API_BASE = (process.env.FX_API_BASE ?? "https://api.frankfurter.app").replace(/\/+$/, "");
const X402_PRICE_USD = parseFloatEnv("X402_PRICE_USD", 0.001);
const X402_RECEIVER = process.env.X402_RECEIVER ?? "merchant";
const X402_VALID_TOKEN = process.env.X402_VALID_TOKEN ?? "demo-valid-payment";

void LucidHttp;
void LucidPayments;

interface ConvertResult {
  from: string;
  to: string;
  amount: number;
  result: number;
  rate: number;
}

interface FrankfurterLatestResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

function parseIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${name}: "${raw}"`);
  }

  return value;
}

function parseFloatEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${name}: "${raw}"`);
  }

  return value;
}

function jsonResponse(
  body: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  const baseHeaders = new Headers(headers);
  if (!baseHeaders.has("content-type")) {
    baseHeaders.set("content-type", "application/json; charset=utf-8");
  }
  if (!baseHeaders.has("cache-control")) {
    baseHeaders.set("cache-control", "no-store");
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: baseHeaders,
  });
}

function parseAmount(raw: string | null): number | null {
  if (raw === null) {
    return null;
  }

  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return amount;
}

function normalizeNumber(value: number): number {
  return Number(value.toFixed(8));
}

function getPaymentHeader(req: Request): string | null {
  for (const headerName of PAYMENT_HEADER_NAMES) {
    const headerValue = req.headers.get(headerName);
    if (headerValue && headerValue.trim().length > 0) {
      return headerValue.trim();
    }
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.trim().length > 0) {
    return authHeader.trim();
  }

  return null;
}

function headersToObject(req: Request): Record<string, string> {
  return Object.fromEntries(req.headers.entries());
}

function coerceVerifierResult(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const fields = ["valid", "ok", "success", "verified", "isValid", "paid"];

    for (const field of fields) {
      const candidate = record[field];
      if (typeof candidate === "boolean") {
        return candidate;
      }
    }
  }

  return null;
}

async function verifyPaymentWithSdk(
  req: Request,
  paymentHeader: string,
): Promise<boolean | null> {
  const moduleAny = LucidPayments as Record<string, unknown>;
  const verifierNames = [
    "verifyX402Payment",
    "verifyPayment",
    "validatePayment",
    "verify",
  ];

  const commonPayload = {
    request: req,
    headers: headersToObject(req),
    paymentHeader,
    payment: paymentHeader,
    amountUsd: X402_PRICE_USD,
    amount: X402_PRICE_USD,
    currency: "USD",
    receiver: X402_RECEIVER,
    route: "/convert",
    method: req.method,
    url: req.url,
  };

  for (const verifierName of verifierNames) {
    const fn = moduleAny[verifierName];
    if (typeof fn !== "function") {
      continue;
    }

    const verifier = fn as (...args: unknown[]) => unknown;
    const argumentVariants: unknown[] = [
      commonPayload,
      req,
      paymentHeader,
      {
        ...commonPayload,
        headers: req.headers,
      },
    ];

    for (const args of argumentVariants) {
      try {
        const result = await verifier(args);
        const coerced = coerceVerifierResult(result);
        if (coerced !== null) {
          return coerced;
        }
      } catch {
        // Try next signature.
      }
    }
  }

  return null;
}

function fallbackPaymentIsValid(paymentHeader: string): boolean {
  const token = paymentHeader.replace(/^Bearer\s+/i, "").trim();
  return token === X402_VALID_TOKEN;
}

function buildDefault402Response(message: string): Response {
  const headers = new Headers({
    "www-authenticate": `X402 realm="${APP_NAME}", amount="${X402_PRICE_USD}", currency="USD"`,
    "x402-required": "true",
    "x402-price-usd": X402_PRICE_USD.toString(),
    "x402-receiver": X402_RECEIVER,
  });

  return jsonResponse(
    {
      error: "payment_required",
      message,
      x402: {
        required: true,
        amountUsd: X402_PRICE_USD,
        currency: "USD",
        receiver: X402_RECEIVER,
        acceptedHeaders: [...PAYMENT_HEADER_NAMES, "authorization"],
      },
    },
    402,
    headers,
  );
}

function maybeBuildSdk402Response(message: string): Response | null {
  const moduleAny = LucidPayments as Record<string, unknown>;
  const builderNames = [
    "createPaymentRequiredResponse",
    "buildPaymentRequiredResponse",
    "paymentRequiredResponse",
    "paymentRequired",
  ];

  const payload = {
    status: 402,
    code: "payment_required",
    message,
    amountUsd: X402_PRICE_USD,
    amount: X402_PRICE_USD,
    currency: "USD",
    receiver: X402_RECEIVER,
    route: "/convert",
  };

  for (const builderName of builderNames) {
    const fn = moduleAny[builderName];
    if (typeof fn !== "function") {
      continue;
    }

    try {
      const response = (fn as (...args: unknown[]) => unknown)(payload);
      if (response instanceof Response) {
        return response;
      }
    } catch {
      // Use default 402 response.
    }
  }

  return null;
}

async function enforceX402(req: Request): Promise<Response | null> {
  const paymentHeader = getPaymentHeader(req);
  if (!paymentHeader) {
    return maybeBuildSdk402Response("x402 payment is required for this endpoint")
      ?? buildDefault402Response("x402 payment is required for this endpoint");
  }

  const sdkResult = await verifyPaymentWithSdk(req, paymentHeader);
  if (sdkResult === true) {
    return null;
  }

  if (sdkResult === false) {
    return maybeBuildSdk402Response("invalid x402 payment proof")
      ?? buildDefault402Response("invalid x402 payment proof");
  }

  if (fallbackPaymentIsValid(paymentHeader)) {
    return null;
  }

  return maybeBuildSdk402Response("invalid x402 payment proof")
    ?? buildDefault402Response("invalid x402 payment proof");
}

async function lookupConversion(
  from: string,
  to: string,
  amount: number,
): Promise<ConvertResult> {
  const endpoint = new URL(`${FX_API_BASE}/latest`);
  endpoint.searchParams.set("from", from);
  endpoint.searchParams.set("to", to);
  endpoint.searchParams.set("amount", amount.toString());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`FX API error ${response.status}: ${text}`);
    }

    const payload = (await response.json()) as FrankfurterLatestResponse;
    const resultRaw = Number(payload.rates?.[to]);

    if (!Number.isFinite(resultRaw)) {
      throw new Error("FX API returned invalid conversion payload");
    }

    const rateRaw = resultRaw / amount;

    return {
      from,
      to,
      amount: normalizeNumber(amount),
      result: normalizeNumber(resultRaw),
      rate: normalizeNumber(rateRaw),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseConvertQuery(url: URL): { from: string; to: string; amount: number } | { error: string } {
  const from = (url.searchParams.get("from") ?? "").toUpperCase();
  const to = (url.searchParams.get("to") ?? "").toUpperCase();
  const amount = parseAmount(url.searchParams.get("amount"));

  if (!CURRENCY_CODE_REGEX.test(from)) {
    return { error: "Invalid 'from' currency. Use ISO 4217 3-letter code, e.g. USD." };
  }

  if (!CURRENCY_CODE_REGEX.test(to)) {
    return { error: "Invalid 'to' currency. Use ISO 4217 3-letter code, e.g. EUR." };
  }

  if (amount === null) {
    return { error: "Invalid 'amount'. Must be a positive number." };
  }

  return { from, to, amount };
}

async function handleConvert(req: Request, url: URL): Promise<Response> {
  const parsed = parseConvertQuery(url);
  if ("error" in parsed) {
    return jsonResponse({ error: parsed.error }, 400);
  }

  const paymentErrorResponse = await enforceX402(req);
  if (paymentErrorResponse) {
    return paymentErrorResponse;
  }

  try {
    const converted = await lookupConversion(parsed.from, parsed.to, parsed.amount);
    return jsonResponse(converted, 200, {
      "x402-charged-usd": X402_PRICE_USD.toString(),
    });
  } catch (error) {
    return jsonResponse(
      {
        error: "fx_lookup_failed",
        message: error instanceof Error ? error.message : "Unknown conversion error",
      },
      502,
    );
  }
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname === "/health") {
    return jsonResponse({ ok: true, service: APP_NAME });
  }

  if (req.method === "GET" && url.pathname === "/convert") {
    return handleConvert(req, url);
  }

  if (req.method === "GET" && url.pathname === "/") {
    return jsonResponse({
      service: APP_NAME,
      usage: "GET /convert?from=USD&to=EUR&amount=100",
      priceUsdPerLookup: X402_PRICE_USD,
      upstreamFxApi: "frankfurter.app",
    });
  }

  return jsonResponse({ error: "not_found" }, 404);
}

Bun.serve({
  port: PORT,
  idleTimeout: 30,
  fetch: handleRequest,
  error(error) {
    return jsonResponse(
      {
        error: "internal_server_error",
        message: error instanceof Error ? error.message : "Unknown server error",
      },
      500,
    );
  },
});

console.log(
  `[${APP_NAME}] listening on port ${PORT} | x402 price: $${X402_PRICE_USD} per lookup | FX API: ${FX_API_BASE}`,
);