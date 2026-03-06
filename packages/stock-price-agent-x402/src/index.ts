import * as LucidHttp from "@lucid-agents/http";
import { enforceX402Payment, STOCK_LOOKUP_PRICE_USD } from "./payment";
import { getStockQuote, sanitizeTicker } from "./stock";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { ...init, headers });
}

async function handleStockLookup(request: Request): Promise<Response> {
  const paymentFailure = await enforceX402Payment(request);
  if (paymentFailure) return paymentFailure;

  const url = new URL(request.url);
  const ticker = sanitizeTicker(url.searchParams.get("ticker"));

  if (!ticker) {
    return jsonResponse(
      { error: "Invalid ticker. Use /stock?ticker=AAPL" },
      { status: 400 }
    );
  }

  try {
    const quote = await getStockQuote(ticker);
    return jsonResponse(quote, {
      status: 200,
      headers: {
        "x402-charged-usd": STOCK_LOOKUP_PRICE_USD.toString()
      }
    });
  } catch (error) {
    return jsonResponse(
      {
        error: "Failed to fetch stock quote",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 502 }
    );
  }
}

async function fetchHandler(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    return jsonResponse({ ok: true });
  }

  if (url.pathname === "/stock") {
    if (request.method !== "GET") {
      return jsonResponse({ error: "Method Not Allowed" }, { status: 405 });
    }
    return handleStockLookup(request);
  }

  if (request.method === "GET" && url.pathname === "/") {
    return jsonResponse({
      name: "stock-price-x402-agent",
      endpoint: "GET /stock?ticker=AAPL",
      price_usd_per_lookup: STOCK_LOOKUP_PRICE_USD
    });
  }

  return jsonResponse({ error: "Not Found" }, { status: 404 });
}

const port = Number(Bun.env.PORT ?? 3000);
const lucidHttpExports = Object.keys(LucidHttp as Record<string, unknown>);
console.log(
  `[bootstrap] Loaded @lucid-agents/http exports: ${lucidHttpExports.length > 0 ? lucidHttpExports.join(", ") : "(none)"}`
);

Bun.serve({
  port,
  fetch: fetchHandler
});

console.log(`[bootstrap] Stock Price Lucid Agent running on port ${port}`);