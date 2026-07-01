import { serveHttp } from "./http";
import { PRICE_USD, requirePaidRequest } from "./payment";
import { lookupWeather } from "./weather";

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

async function app(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    return json({ ok: true });
  }

  if (request.method === "GET" && url.pathname === "/") {
    return json({
      service: "weather-lucid-agent",
      protocol: "x402",
      price_usd: PRICE_USD,
      route: "GET /weather?city=Sydney",
    });
  }

  if (request.method === "GET" && url.pathname === "/weather") {
    const city = url.searchParams.get("city")?.trim();
    if (!city) {
      return json(
        { error: "missing_city", message: "Query parameter 'city' is required." },
        400,
      );
    }

    const paymentGate = await requirePaidRequest(request);
    if (paymentGate) {
      return paymentGate;
    }

    try {
      const weather = await lookupWeather(city);
      return json(weather, 200, { "cache-control": "no-store" });
    } catch (error) {
      return json(
        {
          error: "weather_lookup_failed",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        502,
      );
    }
  }

  return json({ error: "not_found" }, 404);
}

const port = Number(Bun.env.PORT ?? "3000");
serveHttp(app, port);
console.log(`weather-x402-agent listening on :${port}`);