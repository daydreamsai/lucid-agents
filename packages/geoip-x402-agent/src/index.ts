import { isIP } from "node:net";
import * as LucidHttp from "@lucid-agents/http";
import * as LucidPayments from "@lucid-agents/payments";

export interface GeoIpLookupResponse {
  ip: string;
  country: string;
  city: string;
  lat: number;
  lon: number;
  isp: string;
}

export interface GeoIpAgentOptions {
  port: number;
  priceUsd: number;
  paymentToken: string;
  paymentReceiver: string;
  paymentNetwork: string;
  cacheTtlMs: number;
  ipApiTimeoutMs: number;
}

export interface StartedGeoIpAgent {
  port: number;
  stop: () => void;
  fetch: (request: Request) => Promise<Response>;
  options: GeoIpAgentOptions;
}

interface VerifyResult {
  ok: boolean;
  payer?: string;
  reason?: string;
}

const IP_API_BASE = "http://ip-api.com/json";
const IP_API_FIELDS = "status,message,country,city,lat,lon,isp,query";

const lucidHttpAny = LucidHttp as Record<string, unknown>;
const lucidPaymentsAny = LucidPayments as Record<string, unknown>;

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getDefaultOptions(input: Partial<GeoIpAgentOptions>): GeoIpAgentOptions {
  const env = process.env;
  return {
    port: input.port ?? parseNumber(env.PORT, 3000),
    priceUsd: input.priceUsd ?? parseNumber(env.X402_PRICE_USD, 0.0005),
    paymentToken: input.paymentToken ?? env.X402_PAYMENT_TOKEN ?? "dev-x402-token",
    paymentReceiver: input.paymentReceiver ?? env.X402_PAYMENT_RECEIVER ?? "geoip-agent",
    paymentNetwork: input.paymentNetwork ?? env.X402_PAYMENT_NETWORK ?? "base",
    cacheTtlMs: input.cacheTtlMs ?? parseNumber(env.GEOIP_CACHE_TTL_MS, 300_000),
    ipApiTimeoutMs: input.ipApiTimeoutMs ?? parseNumber(env.IP_API_TIMEOUT_MS, 8_000),
  };
}

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  const maybeJsonHelper = lucidHttpAny.json;
  if (typeof maybeJsonHelper === "function") {
    try {
      return (maybeJsonHelper as (body: unknown, init?: ResponseInit) => Response)(payload, init);
    } catch {
      // fallback below
    }
  }

  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }

  return new Response(JSON.stringify(payload), {
    ...init,
    headers,
  });
}

function firstHeader(request: Request, names: string[]): string | null {
  for (const name of names) {
    const value = request.headers.get(name);
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function normalizePaymentToken(rawValue: string): string {
  let value = rawValue.trim();

  if (value.toLowerCase().startsWith("bearer ")) {
    value = value.slice(7).trim();
  }

  if (value.toLowerCase().startsWith("x402 ")) {
    value = value.slice(5).trim();
  }

  return value;
}

class LookupError extends Error {
  public readonly statusCode: number;

  public constructor(message: string, statusCode: number) {
    super(message);
    this.name = "LookupError";
    this.statusCode = statusCode;
  }
}

class TtlCache<T> {
  private readonly map = new Map<string, { expiresAt: number; value: T }>();

  public constructor(private readonly ttlMs: number) {}

  public get(key: string): T | null {
    const hit = this.map.get(key);
    if (!hit) return null;

    if (hit.expiresAt <= Date.now()) {
      this.map.delete(key);
      return null;
    }

    return hit.value;
  }

  public set(key: string, value: T): void {
    this.map.set(key, {
      expiresAt: Date.now() + this.ttlMs,
      value,
    });
  }
}

type DelegatedVerifier = (request: Request) => Promise<unknown>;

class X402PaymentVerifier {
  private delegatedVerifier: DelegatedVerifier | null = null;

  public constructor(private readonly options: GeoIpAgentOptions) {
    this.delegatedVerifier = this.tryCreateDelegatedVerifier();
  }

  public challengeHeaders(): Headers {
    const headers = new Headers();
    headers.set("x402-payment-required", "true");
    headers.set("x402-price-usd", this.options.priceUsd.toString());
    headers.set("x402-receiver", this.options.paymentReceiver);
    headers.set("x402-network", this.options.paymentNetwork);
    headers.set(
      "www-authenticate",
      `x402 realm="geoip", amount="${this.options.priceUsd}", currency="USD", receiver="${this.options.paymentReceiver}"`
    );
    return headers;
  }

  public async verify(request: Request): Promise<VerifyResult> {
    if (this.delegatedVerifier) {
      try {
        const delegated = await this.delegatedVerifier(request);
        const normalized = this.normalizeDelegatedResult(delegated);
        if (normalized) {
          return normalized;
        }
      } catch {
        // fallback to local verification
      }
    }

    const rawHeader = firstHeader(request, [
      "x-402-payment",
      "x402-payment",
      "x-payment",
      "payment",
      "authorization",
    ]);

    if (!rawHeader) {
      return { ok: false, reason: "missing payment header" };
    }

    const token = normalizePaymentToken(rawHeader);
    if (token !== this.options.paymentToken) {
      return { ok: false, reason: "invalid payment token" };
    }

    return { ok: true, payer: "x402-header" };
  }

  private normalizeDelegatedResult(value: unknown): VerifyResult | null {
    if (typeof value === "boolean") {
      return value ? { ok: true } : { ok: false, reason: "delegated verifier rejected payment" };
    }

    if (!value || typeof value !== "object") {
      return null;
    }

    const obj = value as Record<string, unknown>;
    const okValue = obj.ok ?? obj.valid ?? obj.success ?? obj.paid;
    const ok = typeof okValue === "boolean" ? okValue : null;
    if (ok === null) {
      return null;
    }

    const payer = typeof obj.payer === "string" ? obj.payer : undefined;
    const reason =
      typeof obj.reason === "string"
        ? obj.reason
        : typeof obj.error === "string"
        ? obj.error
        : undefined;

    return { ok, payer, reason };
  }

  private tryCreateDelegatedVerifier(): DelegatedVerifier | null {
    const candidateFactories = [
      "createX402Verifier",
      "createPaymentVerifier",
      "createVerifier",
      "x402Verifier",
    ];

    for (const key of candidateFactories) {
      const maybeFactory = lucidPaymentsAny[key];
      if (typeof maybeFactory !== "function") {
        continue;
      }

      try {
        const created = (maybeFactory as (...args: unknown[]) => unknown)({
          amount: this.options.priceUsd,
          price: this.options.priceUsd,
          priceUsd: this.options.priceUsd,
          currency: "USD",
          receiver: this.options.paymentReceiver,
          network: this.options.paymentNetwork,
          token: this.options.paymentToken,
          secret: this.options.paymentToken,
        });

        if (typeof created === "function") {
          return async (request: Request) =>
            (created as (req: Request) => unknown | Promise<unknown>)(request);
        }

        if (created && typeof created === "object" && "verify" in created) {
          const maybeVerify = (created as { verify?: unknown }).verify;
          if (typeof maybeVerify === "function") {
            return async (request: Request) =>
              (maybeVerify as (req: Request) => unknown | Promise<unknown>)(request);
          }
        }
      } catch {
        // try next factory
      }
    }

    return null;
  }
}

async function fetchGeoFromIpApi(ip: string, timeoutMs: number): Promise<GeoIpLookupResponse> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const endpoint = `${IP_API_BASE}/${encodeURIComponent(ip)}?fields=${IP_API_FIELDS}`;
    const upstream = await fetch(endpoint, {
      method: "GET",
      signal: abortController.signal,
      headers: {
        "user-agent": "lucid-geoip-x402-agent/1.0",
      },
    });

    if (!upstream.ok) {
      throw new LookupError(`ip-api upstream error (${upstream.status})`, 502);
    }

    const payload = (await upstream.json()) as Record<string, unknown>;
    const status = payload.status;

    if (status !== "success") {
      const message = typeof payload.message === "string" ? payload.message : "lookup failed";
      throw new LookupError(message, 400);
    }

    const ipValue = typeof payload.query === "string" ? payload.query : ip;
    const country = typeof payload.country === "string" ? payload.country : "";
    const city = typeof payload.city === "string" ? payload.city : "";
    const isp = typeof payload.isp === "string" ? payload.isp : "";
    const lat = Number(payload.lat);
    const lon = Number(payload.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new LookupError("invalid geolocation payload from upstream", 502);
    }

    return {
      ip: ipValue,
      country,
      city,
      lat,
      lon,
      isp,
    };
  } catch (error) {
    if (error instanceof LookupError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new LookupError("ip-api request timed out", 504);
    }

    throw new LookupError("failed to lookup geolocation", 502);
  } finally {
    clearTimeout(timeout);
  }
}

export function createGeoIpAgent(input: Partial<GeoIpAgentOptions> = {}) {
  const options = getDefaultOptions(input);
  const cache = new TtlCache<GeoIpLookupResponse>(options.cacheTtlMs);
  const verifier = new X402PaymentVerifier(options);

  const fetchHandler = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return jsonResponse(
        {
          status: "ok",
          service: "geoip-x402-agent",
        },
        { status: 200 }
      );
    }

    if (url.pathname === "/") {
      return jsonResponse(
        {
          service: "geoip-x402-agent",
          endpoint: "GET /geoip?ip=8.8.8.8",
          priceUsd: options.priceUsd,
          paymentHeader: "x-402-payment",
        },
        { status: 200 }
      );
    }

    if (url.pathname !== "/geoip") {
      return jsonResponse({ error: "Not Found" }, { status: 404 });
    }

    if (request.method !== "GET") {
      return jsonResponse({ error: "Method Not Allowed" }, { status: 405 });
    }

    const ip = url.searchParams.get("ip")?.trim();
    if (!ip) {
      return jsonResponse({ error: 'Missing required query param "ip"' }, { status: 400 });
    }

    if (isIP(ip) === 0) {
      return jsonResponse({ error: "Invalid IP address format" }, { status: 400 });
    }

    const paymentResult = await verifier.verify(request);
    if (!paymentResult.ok) {
      const headers = verifier.challengeHeaders();
      headers.set("x402-required-header", "x-402-payment");
      return jsonResponse(
        {
          error: "Payment Required",
          amountUsd: options.priceUsd,
          currency: "USD",
          requiredHeader: "x-402-payment",
          reason: paymentResult.reason ?? "payment verification failed",
        },
        { status: 402, headers }
      );
    }

    const cached = cache.get(ip);
    if (cached) {
      return jsonResponse(cached, {
        status: 200,
        headers: {
          "x-geoip-cache": "HIT",
        },
      });
    }

    try {
      const geo = await fetchGeoFromIpApi(ip, options.ipApiTimeoutMs);
      cache.set(ip, geo);

      return jsonResponse(geo, {
        status: 200,
        headers: {
          "x-geoip-cache": "MISS",
        },
      });
    } catch (error) {
      if (error instanceof LookupError) {
        return jsonResponse({ error: error.message }, { status: error.statusCode });
      }

      return jsonResponse({ error: "Unknown server error" }, { status: 500 });
    }
  };

  return {
    options,
    fetch: fetchHandler,
  };
}

export function startGeoIpAgent(input: Partial<GeoIpAgentOptions> = {}): StartedGeoIpAgent {
  const agent = createGeoIpAgent(input);

  const server = Bun.serve({
    port: agent.options.port,
    fetch: agent.fetch,
  });

  return {
    port: server.port,
    stop: () => server.stop(true),
    fetch: agent.fetch,
    options: agent.options,
  };
}