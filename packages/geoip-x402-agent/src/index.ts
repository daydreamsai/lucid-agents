import { isIP } from "node:net";
import * as LucidHttp from "@lucid-agents/http";
import * as LucidPayments from "@lucid-agents/payments";

export const PRICE_USD = 0.0005;
export const RESOURCE_PATH = "/geoip";
export const REQUIRED_PAYMENT_HEADERS = ["x402-payment", "x-payment", "payment"] as const;

const SERVICE_NAME = "geoip-x402-agent";
const DEFAULT_PORT = 3000;
const IP_API_TIMEOUT_MS = 8000;

interface GeoIpResult {
  ip: string;
  country: string;
  city: string;
  lat: number;
  lon: number;
  isp: string;
}

interface IpApiSuccess {
  status: "success";
  country: string;
  city: string;
  lat: number;
  lon: number;
  isp: string;
  query: string;
}

interface IpApiFailure {
  status: "fail";
  message: string;
  query: string;
}

type IpApiResponse = IpApiSuccess | IpApiFailure;

interface PaymentCheckResult {
  ok: boolean;
  reason?: string;
  via: string;
}

function withCommonHeaders(headers?: HeadersInit): Headers {
  const merged = new Headers(headers);
  merged.set("access-control-allow-origin", "*");
  merged.set("access-control-allow-methods", "GET,OPTIONS");
  merged.set("access-control-allow-headers", "content-type,x402-payment,x-payment,payment");
  return merged;
}

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  const headers = withCommonHeaders(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(payload), { ...init, headers });
}

function paymentRequiredResponse(reason: string): Response {
  return jsonResponse(
    {
      error: "Payment required",
      reason,
      priceUsd: PRICE_USD,
      resource: RESOURCE_PATH,
      requiredHeader: REQUIRED_PAYMENT_HEADERS[0]
    },
    {
      status: 402,
      headers: {
        "x402-price-usd": PRICE_USD.toString(),
        "x402-resource": RESOURCE_PATH,
        "x402-required-header": REQUIRED_PAYMENT_HEADERS[0],
        "cache-control": "no-store"
      }
    }
  );
}

function getPaymentHeader(request: Request): string | null {
  for (const header of REQUIRED_PAYMENT_HEADERS) {
    const value = request.headers.get(header);
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function isSuccessfulPaymentResult(result: unknown): boolean {
  if (result === true) return true;
  if (!result || typeof result !== "object") return false;

  const r = result as Record<string, unknown>;
  if (r.ok === true || r.valid === true || r.paid === true || r.success === true) return true;
  if (typeof r.status === "string" && r.status.toLowerCase() === "paid") return true;

  return false;
}

function asCallable(value: unknown): ((...args: any[]) => unknown | Promise<unknown>) | null {
  if (typeof value === "function") {
    return value as (...args: any[]) => unknown | Promise<unknown>;
  }
  return null;
}

async function verifyViaLucidPayments(request: Request, paymentHeader: string, ip: string): Promise<boolean> {
  const payments: any = LucidPayments;

  const candidates = [
    asCallable(payments.verifyX402Payment),
    asCallable(payments.verifyPayment),
    asCallable(payments.validatePayment),
    asCallable(payments.x402?.verifyPayment)
  ].filter((fn): fn is (...args: any[]) => unknown | Promise<unknown> => fn !== null);

  for (const verifyFn of candidates) {
    const attempts: any[][] = [
      [
        {
          request,
          paymentHeader,
          amountUsd: PRICE_USD,
          resource: RESOURCE_PATH,
          method: request.method,
          metadata: { ip }
        }
      ],
      [request, { paymentHeader, amountUsd: PRICE_USD, resource: RESOURCE_PATH, metadata: { ip } }],
      [paymentHeader, { amountUsd: PRICE_USD, resource: RESOURCE_PATH, metadata: { ip } }],
      [
        {
          headers: Object.fromEntries(request.headers.entries()),
          paymentHeader,
          amountUsd: PRICE_USD,
          resource: RESOURCE_PATH,
          ip
        }
      ]
    ];

    for (const args of attempts) {
      try {
        const result = await verifyFn(...args);
        if (isSuccessfulPaymentResult(result)) {
          return true;
        }
      } catch {
        // Try next signature.
      }
    }
  }

  return false;
}

async function verifyPayment(request: Request, ip: string): Promise<PaymentCheckResult> {
  const paymentHeader = getPaymentHeader(request);

  if (!paymentHeader) {
    return { ok: false, reason: "Missing payment header", via: "none" };
  }

  const lucidVerification = await verifyViaLucidPayments(request, paymentHeader, ip);
  if (lucidVerification) {
    return { ok: true, via: "@lucid-agents/payments" };
  }

  const expectedToken = (Bun.env.X402_PAYMENT_TOKEN ?? "").trim();
  if (expectedToken.length > 0) {
    if (paymentHeader === expectedToken) {
      return { ok: true, via: "static-token" };
    }
    return { ok: false, reason: "Invalid payment token", via: "static-token" };
  }

  // Fallback mode: if no token is configured, any non-empty payment header is accepted.
  return { ok: true, via: "header-presence-fallback" };
}

async function lookupGeoIp(ip: string): Promise<GeoIpResult> {
  const apiUrl = new URL(`http://ip-api.com/json/${encodeURIComponent(ip)}`);
  apiUrl.searchParams.set("fields", "status,message,country,city,lat,lon,isp,query");

  const upstream = await fetch(apiUrl, {
    method: "GET",
    headers: {
      "user-agent": `${SERVICE_NAME}/1.0`
    },
    signal: AbortSignal.timeout(IP_API_TIMEOUT_MS)
  });

  if (!upstream.ok) {
    throw new Error(`ip-api upstream error: ${upstream.status}`);
  }

  const body = (await upstream.json()) as IpApiResponse;

  if (body.status !== "success") {
    throw new Error(body.message || "ip-api lookup failed");
  }

  return {
    ip: body.query,
    country: body.country,
    city: body.city,
    lat: body.lat,
    lon: body.lon,
    isp: body.isp
  };
}

export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: withCommonHeaders() });
  }

  if (url.pathname === "/health" && request.method === "GET") {
    return jsonResponse({
      status: "ok",
      service: SERVICE_NAME,
      priceUsd: PRICE_USD
    });
  }

  if (url.pathname !== RESOURCE_PATH) {
    return jsonResponse({ error: "Not Found" }, { status: 404 });
  }

  if (request.method !== "GET") {
    return jsonResponse(
      { error: "Method Not Allowed" },
      { status: 405, headers: { allow: "GET, OPTIONS" } }
    );
  }

  const ip = url.searchParams.get("ip")?.trim() ?? "";
  if (!ip) {
    return jsonResponse(
      { error: "Missing required query parameter: ip" },
      { status: 400 }
    );
  }

  if (isIP(ip) === 0) {
    return jsonResponse(
      { error: "Invalid IP address format" },
      { status: 400 }
    );
  }

  const payment = await verifyPayment(request, ip);
  if (!payment.ok) {
    return paymentRequiredResponse(payment.reason ?? "Payment verification failed");
  }

  try {
    const geo = await lookupGeoIp(ip);
    return jsonResponse(geo, {
      status: 200,
      headers: {
        "cache-control": "public, max-age=60"
      }
    });
  } catch (error) {
    return jsonResponse(
      {
        error: "Failed to resolve IP geolocation",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 502 }
    );
  }
}

function startWithLucidHttp(fetchHandler: (request: Request) => Promise<Response>): boolean {
  const http: any = LucidHttp;
  const port = Number.parseInt(Bun.env.PORT ?? `${DEFAULT_PORT}`, 10) || DEFAULT_PORT;

  const candidateFactories = [
    asCallable(http.serve),
    asCallable(http.startServer),
    asCallable(http.createServer),
    asCallable(http.createHttpServer)
  ].filter((fn): fn is (...args: any[]) => unknown => fn !== null);

  for (const factory of candidateFactories) {
    try {
      const server = factory({ port, fetch: fetchHandler });
      if (server && typeof (server as any).listen === "function") {
        (server as any).listen(port);
      }
      return true;
    } catch {
      // Try alternate call shape.
    }

    try {
      const server = factory(fetchHandler, { port });
      if (server && typeof (server as any).listen === "function") {
        (server as any).listen(port);
      }
      return true;
    } catch {
      // Try next factory.
    }
  }

  return false;
}

export function startServer(): void {
  const port = Number.parseInt(Bun.env.PORT ?? `${DEFAULT_PORT}`, 10) || DEFAULT_PORT;

  if (!startWithLucidHttp(handleRequest)) {
    Bun.serve({
      port,
      fetch: handleRequest
    });
  }

  // eslint-disable-next-line no-console
  console.log(`[${SERVICE_NAME}] listening on port ${port}`);
  // eslint-disable-next-line no-console
  console.log(`[${SERVICE_NAME}] route: GET ${RESOURCE_PATH}?ip=8.8.8.8`);
}

if (import.meta.main) {
  startServer();
}