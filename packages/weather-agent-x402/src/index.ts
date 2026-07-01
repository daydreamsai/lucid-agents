import * as LucidHttp from "@lucid-agents/http";
import * as LucidPayments from "@lucid-agents/payments";

const PORT = Number(process.env.PORT ?? 3000);
const LOOKUP_PRICE_USD = 0.001;
const LOOKUP_PRICE_MICRO_USD = 1_000;
const STATIC_ACCEPTED_TOKEN = (process.env.X402_ACCEPTED_TOKEN ?? "").trim();

const GEOCODE_TTL_MS = 24 * 60 * 60 * 1000;
const WEATHER_TTL_MS = 60 * 1000;

interface GeocodePoint {
  name: string;
  latitude: number;
  longitude: number;
}

interface GeocodeApiResponse {
  results?: Array<{
    name: string;
    latitude: number;
    longitude: number;
  }>;
}

interface OpenMeteoCurrentResponse {
  current?: {
    temperature_2m: number;
    relative_humidity_2m: number;
    weather_code: number;
  };
}

interface WeatherData {
  tempC: number;
  humidity: number;
  condition: string;
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const geocodeCache = new Map<string, CacheEntry<GeocodePoint>>();
const weatherCache = new Map<string, CacheEntry<WeatherData>>();

function jsonResponse(status: number, body: unknown, headersInit?: HeadersInit): Response {
  const headers = new Headers(headersInit);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET, OPTIONS");
  headers.set("access-control-allow-headers", "content-type, x-payment, authorization");
  return new Response(JSON.stringify(body), { status, headers });
}

function getFromCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setInCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number): void {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
}

function normalizePaymentToken(input: string): string {
  return input
    .replace(/^Bearer\s+/i, "")
    .replace(/^Token\s+/i, "")
    .replace(/^x402\s+/i, "")
    .trim();
}

function getPaymentToken(req: Request): string | null {
  const xPayment = req.headers.get("x-payment");
  if (xPayment && xPayment.trim().length > 0) {
    return normalizePaymentToken(xPayment);
  }

  const payment = req.headers.get("payment");
  if (payment && payment.trim().length > 0) {
    return normalizePaymentToken(payment);
  }

  const authorization = req.headers.get("authorization");
  if (authorization && authorization.trim().length > 0) {
    return normalizePaymentToken(authorization);
  }

  return null;
}

function isValidPaymentResult(result: unknown): boolean {
  if (result === true) return true;
  if (!result || typeof result !== "object") return false;

  const obj = result as Record<string, unknown>;
  return (
    obj.valid === true ||
    obj.ok === true ||
    obj.success === true ||
    obj.verified === true ||
    obj.isValid === true ||
    obj.paid === true
  );
}

async function verifyWithLucidPayments(req: Request, token: string): Promise<boolean> {
  const paymentsAny = LucidPayments as Record<string, unknown>;
  const headerRecord = Object.fromEntries(req.headers.entries());

  const functionNames = [
    "verifyPayment",
    "verifyX402Payment",
    "validatePayment",
    "verify",
    "checkPayment",
    "isPaymentValid"
  ];

  for (const functionName of functionNames) {
    const maybeFn = paymentsAny[functionName];
    if (typeof maybeFn !== "function") continue;

    const fn = maybeFn as (...args: unknown[]) => unknown;

    const argVariants: unknown[][] = [
      [
        {
          request: req,
          headers: headerRecord,
          token,
          amountUsd: LOOKUP_PRICE_USD,
          amount: LOOKUP_PRICE_USD,
          amountMicroUsd: LOOKUP_PRICE_MICRO_USD,
          route: "/weather",
          method: "GET"
        }
      ],
      [req, { token, amountUsd: LOOKUP_PRICE_USD, route: "/weather", method: "GET" }],
      [token, { amountUsd: LOOKUP_PRICE_USD, route: "/weather", method: "GET" }]
    ];

    for (const args of argVariants) {
      try {
        const result = await Promise.resolve(fn(...args));
        if (isValidPaymentResult(result)) return true;
      } catch {
        // Continue probing possible APIs.
      }
    }
  }

  const factoryNames = ["createPaymentVerifier", "createVerifier", "x402"];
  for (const factoryName of factoryNames) {
    const maybeFactory = paymentsAny[factoryName];
    if (typeof maybeFactory !== "function") continue;

    try {
      const instance = (maybeFactory as (...args: unknown[]) => unknown)({
        amountUsd: LOOKUP_PRICE_USD,
        route: "/weather",
        method: "GET"
      });

      if (typeof instance === "function") {
        const result = await Promise.resolve(
          (instance as (...args: unknown[]) => unknown)(req, {
            token,
            amountUsd: LOOKUP_PRICE_USD
          })
        );
        if (isValidPaymentResult(result)) return true;
      }

      if (instance && typeof instance === "object") {
        const obj = instance as Record<string, unknown>;
        const methods = ["verify", "verifyPayment", "validate"];
        for (const method of methods) {
          const maybeMethod = obj[method];
          if (typeof maybeMethod !== "function") continue;
          const result = await Promise.resolve(
            (maybeMethod as (...args: unknown[]) => unknown)(req, {
              token,
              amountUsd: LOOKUP_PRICE_USD
            })
          );
          if (isValidPaymentResult(result)) return true;
        }
      }
    } catch {
      // Continue probing.
    }
  }

  return false;
}

async function isPaymentValid(req: Request): Promise<boolean> {
  const token = getPaymentToken(req);
  if (!token) return false;

  if (STATIC_ACCEPTED_TOKEN.length > 0 && token === STATIC_ACCEPTED_TOKEN) {
    return true;
  }

  return verifyWithLucidPayments(req, token);
}

function paymentRequiredResponse(): Response {
  return jsonResponse(
    402,
    {
      error: "payment_required",
      message: "x402 payment required for this endpoint",
      required: {
        amount_usd: LOOKUP_PRICE_USD,
        route: "GET /weather",
        header: "x-payment"
      }
    },
    {
      "x402-price-usd": LOOKUP_PRICE_USD.toString(),
      "x402-amount-microusd": LOOKUP_PRICE_MICRO_USD.toString()
    }
  );
}

function weatherCodeToCondition(code: number): string {
  if (code === 0) return "Clear sky";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code >= 85 && code <= 86) return "Snow showers";
  if (code >= 95 && code <= 99) return "Thunderstorm";
  return "Unknown";
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

async function geocodeCity(city: string): Promise<GeocodePoint | null> {
  const cacheKey = city.trim().toLowerCase();
  const cached = getFromCache(geocodeCache, cacheKey);
  if (cached) return cached;

  const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geocodeUrl.searchParams.set("name", city);
  geocodeUrl.searchParams.set("count", "1");
  geocodeUrl.searchParams.set("language", "en");
  geocodeUrl.searchParams.set("format", "json");

  const res = await fetch(geocodeUrl.toString(), {
    method: "GET",
    headers: { accept: "application/json" }
  });

  if (!res.ok) {
    throw new Error(`Geocoding failed with status ${res.status}`);
  }

  const payload = (await res.json()) as GeocodeApiResponse;
  const first = payload.results?.[0];
  if (!first) return null;

  const point: GeocodePoint = {
    name: first.name,
    latitude: first.latitude,
    longitude: first.longitude
  };

  setInCache(geocodeCache, cacheKey, point, GEOCODE_TTL_MS);
  return point;
}

async function fetchCurrentWeather(latitude: number, longitude: number): Promise<WeatherData> {
  const cacheKey = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
  const cached = getFromCache(weatherCache, cacheKey);
  if (cached) return cached;

  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.searchParams.set("latitude", latitude.toString());
  weatherUrl.searchParams.set("longitude", longitude.toString());
  weatherUrl.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,weather_code"
  );
  weatherUrl.searchParams.set("timezone", "auto");

  const res = await fetch(weatherUrl.toString(), {
    method: "GET",
    headers: { accept: "application/json" }
  });

  if (!res.ok) {
    throw new Error(`Weather API failed with status ${res.status}`);
  }

  const payload = (await res.json()) as OpenMeteoCurrentResponse;
  if (!payload.current) {
    throw new Error("Weather API returned no current weather");
  }

  const weatherData: WeatherData = {
    tempC: payload.current.temperature_2m,
    humidity: payload.current.relative_humidity_2m,
    condition: weatherCodeToCondition(payload.current.weather_code)
  };

  setInCache(weatherCache, cacheKey, weatherData, WEATHER_TTL_MS);
  return weatherData;
}

async function handleWeather(req: Request, url: URL): Promise<Response> {
  const city = url.searchParams.get("city")?.trim() ?? "";
  if (!city) {
    return jsonResponse(400, {
      error: "invalid_request",
      message: 'Missing required query parameter "city"'
    });
  }

  const paid = await isPaymentValid(req);
  if (!paid) {
    return paymentRequiredResponse();
  }

  const point = await geocodeCity(city);
  if (!point) {
    return jsonResponse(404, {
      error: "city_not_found",
      message: `No location found for "${city}"`
    });
  }

  const weather = await fetchCurrentWeather(point.latitude, point.longitude);

  return jsonResponse(
    200,
    {
      city: point.name,
      temp_c: roundOneDecimal(weather.tempC),
      condition: weather.condition,
      humidity: weather.humidity
    },
    { "cache-control": "no-store" }
  );
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "content-type, x-payment, authorization"
      }
    });
  }

  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname === "/") {
    return jsonResponse(200, {
      name: "weather-lucid-agent-x402",
      status: "ok",
      routes: ["GET /weather?city=..."],
      payment: {
        endpoint: "/weather",
        amount_usd: LOOKUP_PRICE_USD,
        required_header: "x-payment"
      }
    });
  }

  if (req.method === "GET" && url.pathname === "/health") {
    return jsonResponse(200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/weather") {
    try {
      return await handleWeather(req, url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected server error";
      return jsonResponse(502, {
        error: "upstream_error",
        message
      });
    }
  }

  return jsonResponse(404, { error: "not_found" });
}

function tryStartWithLucidHttp(fetchHandler: (req: Request) => Promise<Response>): boolean {
  const httpAny = LucidHttp as Record<string, unknown>;
  const serverFunctionNames = ["serve", "createServer", "createHttpServer", "startServer"];

  for (const serverFunctionName of serverFunctionNames) {
    const maybeFn = httpAny[serverFunctionName];
    if (typeof maybeFn !== "function") continue;

    try {
      const result = (maybeFn as (...args: unknown[]) => unknown)({
        port: PORT,
        fetch: fetchHandler
      });

      if (result && typeof result === "object") {
        const maybeListen = (result as { listen?: () => void }).listen;
        if (typeof maybeListen === "function") {
          maybeListen();
        }
      }

      console.log(
        `[weather-agent-x402] Started with @lucid-agents/http.${serverFunctionName} on :${PORT}`
      );
      return true;
    } catch {
      // Try next function signature/export.
    }
  }

  return false;
}

function start(): void {
  const fetchHandler = (req: Request): Promise<Response> => handleRequest(req);

  const startedByLucidHttp = tryStartWithLucidHttp(fetchHandler);
  if (!startedByLucidHttp) {
    const server = Bun.serve({
      port: PORT,
      fetch: fetchHandler
    });
    console.log(`[weather-agent-x402] Started with Bun.serve on :${server.port}`);
  }

  const lucidHttpExportCount = Object.keys(LucidHttp).length;
  const lucidPaymentsExportCount = Object.keys(LucidPayments).length;
  console.log(
    `[weather-agent-x402] Loaded packages: @lucid-agents/http (${lucidHttpExportCount} exports), @lucid-agents/payments (${lucidPaymentsExportCount} exports)`
  );
}

start();

export { handleRequest, isPaymentValid, geocodeCity, fetchCurrentWeather };