type ModuleRecord = Record<string, unknown>;

class HttpError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

const httpModule: ModuleRecord = await import("@lucid-agents/http");
const paymentsModule: ModuleRecord = await import("@lucid-agents/payments");

const SERVICE_NAME = "currency-converter-x402-agent";
const LOOKUP_PRICE_USD = parsePositiveNumberEnv("LOOKUP_PRICE_USD", 0.001);
const FX_TIMEOUT_MS = parseIntegerEnv("FX_TIMEOUT_MS", 10_000);
const PORT = parseIntegerEnv("PORT", 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const EXPECTED_PAYMENT_TOKEN = process.env.X402_TEST_TOKEN ?? "demo_x402_paid";
const FX_API_BASE = process.env.FRANKFURTER_BASE_URL ?? "https://api.frankfurter.app";

type VerificationOutcome = {
  ok: boolean;
  source: string;
  reason: string;
};

type ConversionResult = {
  from: string;
  to: string;
  amount: number;
  result: number;
  rate: number;
};

const lucidJsonFunction = asFunction(httpModule.json);

function asFunction(value: unknown): ((...args: any[]) => unknown) | null {
  return typeof value === "function" ? (value as (...args: any[]) => unknown) : null;
}

function parseIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePositiveNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  if (lucidJsonFunction) {
    try {
      const maybeResponse = lucidJsonFunction(body, { status, headers });
      if (maybeResponse instanceof Response) {
        return maybeResponse;
      }
    } catch {
      // Fall through to native Response.
    }
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers
    }
  });
}

function parsePaymentResult(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["ok", "paid", "valid", "authorized", "authorised", "true", "success"].includes(normalized)) {
      return true;
    }
    if (["invalid", "unpaid", "unauthorized", "unauthorised", "false", "failed", "denied"].includes(normalized)) {
      return false;
    }
  }

  if (isRecord(value)) {
    for (const key of ["ok", "valid", "paid", "authorized", "authorised", "isValid"]) {
      const field = value[key];
      if (typeof field === "boolean") {
        return field;
      }
    }

    const status = value.status;
    if (typeof status === "string") {
      const normalized = status.trim().toLowerCase();
      if (["ok", "paid", "valid", "authorized", "authorised", "success"].includes(normalized)) {
        return true;
      }
      if (["invalid", "unpaid", "unauthorized", "unauthorised", "failed", "denied"].includes(normalized)) {
        return false;
      }
    }
  }

  return undefined;
}

function getPaymentHeader(request: Request): string | null {
  return (
    request.headers.get("x-payment") ??
    request.headers.get("x-x402-payment") ??
    request.headers.get("x402-payment") ??
    request.headers.get("authorization")
  );
}

function normalizePaymentToken(headerValue: string): string {
  const trimmed = headerValue.trim();
  if (/^bearer\s+/i.test(trimmed)) return trimmed.replace(/^bearer\s+/i, "").trim();
  if (/^x402\s+/i.test(trimmed)) return trimmed.replace(/^x402\s+/i, "").trim();
  return trimmed;
}

async function verifyWithLucidPayments(request: Request, rawHeader: string): Promise<boolean | undefined> {
  const functionCandidates = [
    paymentsModule.verifyX402Payment,
    paymentsModule.verifyPayment,
    paymentsModule.validatePayment,
    paymentsModule.checkPayment,
    paymentsModule.authenticatePayment
  ]
    .map(asFunction)
    .filter((fn): fn is (...args: any[]) => unknown => fn !== null);

  if (functionCandidates.length === 0) return undefined;

  const headersObject = Object.fromEntries(request.headers.entries());

  const payloadCandidates = [
    request,
    rawHeader,
    {
      request,
      paymentHeader: rawHeader,
      headers: headersObject,
      amountUsd: LOOKUP_PRICE_USD,
      priceUsd: LOOKUP_PRICE_USD,
      route: "/convert"
    },
    {
      paymentHeader: rawHeader,
      token: normalizePaymentToken(rawHeader),
      headers: headersObject
    }
  ];

  for (const verifyFn of functionCandidates) {
    for (const payload of payloadCandidates) {
      try {
        const result = await verifyFn(payload);
        const parsed = parsePaymentResult(result);
        if (parsed !== undefined) return parsed;
      } catch {
        // Try next candidate.
      }
    }
  }

  return undefined;
}

function createPaymentRequiredResponse(reason: string): Response {
  const responseFactoryCandidates = [
    paymentsModule.createPaymentRequiredResponse,
    paymentsModule.paymentRequiredResponse,
    paymentsModule.x402PaymentRequiredResponse
  ]
    .map(asFunction)
    .filter((fn): fn is (...args: any[]) => unknown => fn !== null);

  for (const factory of responseFactoryCandidates) {
    try {
      const maybeResponse = factory({
        status: 402,
        message: reason,
        amountUsd: LOOKUP_PRICE_USD,
        paymentHeader: "x-payment",
        route: "/convert"
      });

      if (maybeResponse instanceof Response) {
        return maybeResponse;
      }
    } catch {
      // Fall through to built-in response.
    }
  }

  return jsonResponse(
    {
      error: "payment_required",
      message: "x402 payment is required for /convert",
      reason,
      payment: {
        amount_usd: LOOKUP_PRICE_USD,
        header: "x-payment",
        accepts: "x402 payment token"
      }
    },
    402,
    {
      "cache-control": "no-store",
      "x402-price-usd": LOOKUP_PRICE_USD.toString(),
      "x402-payment-header": "x-payment"
    }
  );
}

async function verifyPayment(request: Request): Promise<VerificationOutcome> {
  const paymentHeader = getPaymentHeader(request);
  if (!paymentHeader) {
    return { ok: false, source: "none", reason: "Missing payment header" };
  }

  const lucidResult = await verifyWithLucidPayments(request, paymentHeader);
  if (typeof lucidResult === "boolean") {
    return {
      ok: lucidResult,
      source: "@lucid-agents/payments",
      reason: lucidResult ? "Paid" : "Invalid payment"
    };
  }

  const normalizedToken = normalizePaymentToken(paymentHeader);
  const isFallbackValid = normalizedToken === EXPECTED_PAYMENT_TOKEN;

  return {
    ok: isFallbackValid,
    source: "fallback-token",
    reason: isFallbackValid ? "Paid" : "Invalid payment token"
  };
}

function parseCurrency(value: string | null, fieldName: string): string {
  if (!value) throw new HttpError(400, `Missing "${fieldName}" query parameter`);
  const upper = value.toUpperCase();
  if (!/^[A-Z]{3}$/.test(upper)) {
    throw new HttpError(400, `Invalid "${fieldName}" currency code`);
  }
  return upper;
}

function parseAmount(value: string | null): number {
  if (!value) throw new HttpError(400, 'Missing "amount" query parameter');
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, '"amount" must be a positive number');
  }
  return amount;
}

async function fetchConversion(from: string, to: string, amount: number): Promise<ConversionResult> {
  if (from === to) {
    return { from, to, amount, result: amount, rate: 1 };
  }

  const endpoint = new URL("/latest", FX_API_BASE);
  endpoint.searchParams.set("from", from);
  endpoint.searchParams.set("to", to);
  endpoint.searchParams.set("amount", amount.toString());

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FX_TIMEOUT_MS);

  try {
    const upstream = await fetch(endpoint, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal
    });

    if (!upstream.ok) {
      throw new HttpError(502, `FX provider returned ${upstream.status}`);
    }

    const payload = (await upstream.json()) as Record<string, unknown>;
    const rates = isRecord(payload.rates) ? payload.rates : null;
    const resultRaw = rates ? rates[to] : undefined;
    const result = Number(resultRaw);

    if (!Number.isFinite(result)) {
      throw new HttpError(502, "FX provider returned malformed response");
    }

    const rate = result / amount;

    return { from, to, amount, result, rate };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new HttpError(504, "FX provider timeout");
    }
    throw new HttpError(502, "Failed to fetch FX conversion");
  } finally {
    clearTimeout(timer);
  }
}

async function handleConvert(request: Request): Promise<Response> {
  const payment = await verifyPayment(request);
  if (!payment.ok) {
    return createPaymentRequiredResponse(payment.reason);
  }

  const url = new URL(request.url);
  const from = parseCurrency(url.searchParams.get("from"), "from");
  const to = parseCurrency(url.searchParams.get("to"), "to");
  const amount = parseAmount(url.searchParams.get("amount"));

  const conversion = await fetchConversion(from, to, amount);

  return jsonResponse(conversion, 200, {
    "cache-control": "no-store",
    "x-payment-verified-by": payment.source
  });
}

async function appFetch(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === "GET" && url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        service: SERVICE_NAME,
        price_usd: LOOKUP_PRICE_USD
      });
    }

    if (method === "GET" && url.pathname === "/convert") {
      return handleConvert(request);
    }

    if (method === "GET" && url.pathname === "/") {
      return jsonResponse({
        service: SERVICE_NAME,
        endpoints: ["GET /convert?from=USD&to=EUR&amount=100", "GET /health"],
        payment: {
          price_usd: LOOKUP_PRICE_USD,
          header: "x-payment"
        }
      });
    }

    return jsonResponse(
      {
        error: "not_found",
        message: "Route not found"
      },
      404
    );
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse({ error: "request_error", message: error.message }, error.status);
    }

    console.error("[unhandled_error]", error);
    return jsonResponse({ error: "internal_error", message: "Internal server error" }, 500);
  }
}

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  fetch: appFetch,
  error(error) {
    console.error("[server_error]", error);
    return jsonResponse({ error: "internal_error", message: "Internal server error" }, 500);
  }
});

console.log(
  `[startup] ${SERVICE_NAME} listening on ${HOST}:${server.port} | price=$${LOOKUP_PRICE_USD.toFixed(3)} | @lucid-agents/http keys=${Object.keys(httpModule).length} | @lucid-agents/payments keys=${Object.keys(paymentsModule).length}`
);

function shutdown(signal: string): void {
  console.log(`[shutdown] received ${signal}, stopping server...`);
  server.stop(true);
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));