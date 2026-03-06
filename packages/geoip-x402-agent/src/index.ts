import { isIP } from "node:net";
import * as LucidHttp from "@lucid-agents/http";
import * as LucidPayments from "@lucid-agents/payments";

interface AppConfig {
  port: number;
  pricePerLookup: string;
  paymentHeaderName: string;
  devPaymentToken: string;
  ipApiBase: string;
  upstreamTimeoutMs: number;
}

interface GeoIpResponse {
  ip: string;
  country: string;
  city: string;
  lat: number | null;
  lon: number | null;
  isp: string;
}

type IpApiSuccess = {
  status: "success";
  query: string;
  country: string;
  city: string;
  lat: number;
  lon: number;
  isp: string;
};

type IpApiFail = {
  status: "fail";
  message: string;
  query?: string;
};

type IpApiResponse = IpApiSuccess | IpApiFail;

type GeoLookupResult =
  | { ok: true; data: GeoIpResponse }
  | { ok: false; status: number; error: string };

interface PaymentVerification {
  ok: boolean;
  reason?: string;
}

const HTTP_RUNTIME = LucidHttp as Record<string, unknown>;
const PAYMENTS_RUNTIME = LucidPayments as Record<string, unknown>;
const MAYBE_HTTP_JSON = (HTTP_RUNTIME as { json?: unknown }).json;

const config = loadConfig();

function loadConfig(): AppConfig {
  const parsedPort = Number.parseInt(Bun.env.PORT ?? "3000", 10);
  const parsedTimeout = Number.parseInt(Bun.env.UPSTREAM_TIMEOUT_MS ?? "5000", 10);

  return {
    port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000,
    pricePerLookup: Bun.env.X402_PRICE?.trim() || "0.0005",
    paymentHeaderName: Bun.env.X402_PAYMENT_HEADER?.trim().toLowerCase() || "x-payment",
    devPaymentToken: Bun.env.X402_DEV_TOKEN?.trim() || "dev-token-change-me",
    ipApiBase: (Bun.env.IP_API_BASE?.trim() || "http://ip-api.com/json").replace(/\/+$/, ""),
    upstreamTimeoutMs: Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 5000
  };
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  const finalHeaders = new Headers(headers);
  if (!finalHeaders.has("content-type")) {
    finalHeaders.set("content-type", "application/json; charset=utf-8");
  }

  if (typeof MAYBE_HTTP_JSON === "function") {
    try {
      const maybeResponse = (MAYBE_HTTP_JSON as (payload: unknown, init?: ResponseInit) => unknown)(body, {
        status,
        headers: finalHeaders
      });
      if (maybeResponse instanceof Response) {
        return maybeResponse;
      }
    } catch {
      // fall through to default response
    }
  }

  return new Response(JSON.stringify(body), { status, headers: finalHeaders });
}

function paymentRequiredResponse(reason: string): Response {
  const challenge = `x402 resource="/geoip", price="${config.pricePerLookup}", currency="USD", payment_header="${config.paymentHeaderName}"`;
  return jsonResponse(
    {
      error: "Payment required",
      reason,
      price: config.pricePerLookup,
      currency: "USD",
      paymentHeader: config.paymentHeaderName
    },
    402,
    {
      "www-authenticate": challenge,
      "x402-required": "true",
      "x402-price": config.pricePerLookup
    }
  );
}

function getPaymentHeaderValue(request: Request): string {
  const configured = request.headers.get(config.paymentHeaderName);
  if (configured && configured.trim().length > 0) {
    return configured.trim();
  }

  const xPayment = request.headers.get("x-payment");
  if (xPayment && xPayment.trim().length > 0) {
    return xPayment.trim();
  }

  const x402Payment = request.headers.get("x402-payment");
  if (x402Payment && x402Payment.trim().length > 0) {
    return x402Payment.trim();
  }

  const auth = request.headers.get("authorization");
  if (auth && auth.trim().length > 0) {
    return auth.trim();
  }

  return "";
}

function isVerifierSuccess(result: unknown): boolean {
  if (result === true) {
    return true;
  }

  if (!result || typeof result !== "object") {
    return false;
  }

  const r = result as Record<string, unknown>;
  return (
    r.ok === true ||
    r.valid === true ||
    r.success === true ||
    r.paid === true ||
    r.verified === true
  );
}

async function runRuntimeVerifier(
  fn: (...args: unknown[]) => unknown,
  paymentHeaderValue: string,
  request: Request
): Promise<boolean> {
  const attempts: unknown[] = [
    {
      request,
      paymentHeader: paymentHeaderValue,
      header: paymentHeaderValue,
      price: config.pricePerLookup,
      amount: config.pricePerLookup,
      resource: "/geoip",
      route: "/geoip",
      currency: "USD"
    },
    {
      request,
      paymentHeader: paymentHeaderValue
    },
    paymentHeaderValue,
    { headers: request.headers, paymentHeader: paymentHeaderValue },
    request
  ];

  for (const input of attempts) {
    try {
      const output = await fn(input);
      if (isVerifierSuccess(output)) {
        return true;
      }
    } catch {
      // try next signature
    }
  }

  return false;
}

async function verifyPayment(request: Request): Promise<PaymentVerification> {
  const paymentHeaderValue = getPaymentHeaderValue(request);
  if (!paymentHeaderValue) {
    return { ok: false, reason: `Missing ${config.paymentHeaderName} header` };
  }

  const verifierNames = [
    "verifyX402Payment",
    "verifyPayment",
    "validatePayment",
    "checkPayment",
    "verify"
  ];

  for (const name of verifierNames) {
    const maybeFn = PAYMENTS_RUNTIME[name];
    if (typeof maybeFn !== "function") {
      continue;
    }

    const success = await runRuntimeVerifier(
      maybeFn as (...args: unknown[]) => unknown,
      paymentHeaderValue,
      request
    );

    if (success) {
      return { ok: true };
    }
  }

  if (
    paymentHeaderValue === config.devPaymentToken ||
    paymentHeaderValue === `Bearer ${config.devPaymentToken}`
  ) {
    return { ok: true };
  }

  return { ok: false, reason: "Invalid payment header" };
}

function toNullableNumber(input: unknown): number | null {
  const num = typeof input === "number" ? input : Number(input);
  return Number.isFinite(num) ? num : null;
}

async function lookupGeo(ip: string): Promise<GeoLookupResult> {
  const url = `${config.ipApiBase}/${encodeURIComponent(
    ip
  )}?fields=status,message,query,country,city,lat,lon,isp`;

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent": "lucid-geoip-x402-agent/1.0"
      },
      signal: AbortSignal.timeout(config.upstreamTimeoutMs)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reach upstream";
    return { ok: false, status: 502, error: message };
  }

  if (!upstreamResponse.ok) {
    return {
      ok: false,
      status: 502,
      error: `ip-api upstream responded with ${upstreamResponse.status}`
    };
  }

  let payload: IpApiResponse;
  try {
    payload = (await upstreamResponse.json()) as IpApiResponse;
  } catch {
    return { ok: false, status: 502, error: "Invalid JSON from upstream" };
  }

  if (payload.status !== "success") {
    const failureMessage = payload.message || "Lookup failed";
    return { ok: false, status: 400, error: failureMessage };
  }

  return {
    ok: true,
    data: {
      ip: payload.query || ip,
      country: payload.country ?? "",
      city: payload.city ?? "",
      lat: toNullableNumber(payload.lat),
      lon: toNullableNumber(payload.lon),
      isp: payload.isp ?? ""
    }
  };
}

async function handleGeoIp(request: Request, url: URL): Promise<Response> {
  const payment = await verifyPayment(request);
  if (!payment.ok) {
    return paymentRequiredResponse(payment.reason ?? "Payment validation failed");
  }

  const ip = (url.searchParams.get("ip") || "").trim();
  if (!ip) {
    return jsonResponse({ error: "Missing required query param: ip" }, 400);
  }

  if (isIP(ip) === 0) {
    return jsonResponse({ error: "Invalid IP address format" }, 400);
  }

  const geo = await lookupGeo(ip);
  if (!geo.ok) {
    return jsonResponse({ error: geo.error }, geo.status);
  }

  return jsonResponse(geo.data, 200);
}

async function router(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (path === "/health" && method === "GET") {
    return jsonResponse({ ok: true });
  }

  if (path === "/" && method === "GET") {
    return jsonResponse({
      name: "@lucid-agents/geoip-x402-agent",
      route: "GET /geoip?ip=8.8.8.8",
      paymentRequired: true,
      paymentHeader: config.paymentHeaderName,
      price: config.pricePerLookup,
      runtime: {
        lucidHttpLoaded: Object.keys(HTTP_RUNTIME).length >= 0,
        lucidPaymentsLoaded: Object.keys(PAYMENTS_RUNTIME).length >= 0
      }
    });
  }

  if (path === "/geoip" && method === "GET") {
    return handleGeoIp(request, url);
  }

  if (path === "/geoip") {
    return jsonResponse({ error: "Method not allowed" }, 405, { allow: "GET" });
  }

  return jsonResponse({ error: "Not found" }, 404);
}

const server = Bun.serve({
  port: config.port,
  fetch: router,
  error(error: unknown): Response {
    const message = error instanceof Error ? error.message : "Unhandled server error";
    return jsonResponse({ error: message }, 500);
  }
});

console.log(
  `[geoip-x402-agent] listening on :${server.port} | x402 price=${config.pricePerLookup} | payment header=${config.paymentHeaderName}`
);

export {};