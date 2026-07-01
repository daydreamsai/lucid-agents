export interface StockQuoteResponse {
  ticker: string;
  price: number;
  change: number;
  change_pct: number;
  volume: number;
  timestamp: string;
}

interface YahooQuoteRecord {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  regularMarketTime?: number;
}

interface YahooQuoteApiResponse {
  quoteResponse?: {
    result?: YahooQuoteRecord[];
  };
}

const YAHOO_HOST = "query1.finance.yahoo.com";
const YAHOO_PATH = "/v7/finance/quote";

function asFiniteNumber(value: unknown, fallback = 0): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

export function sanitizeTicker(rawTicker: string | null): string | null {
  if (!rawTicker) return null;
  const ticker = rawTicker.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) return null;
  return ticker;
}

export async function getStockQuote(ticker: string): Promise<StockQuoteResponse> {
  const timeoutMs = Number(Bun.env.STOCK_REQUEST_TIMEOUT_MS ?? 8000);
  const base = `${"https:"}//${YAHOO_HOST}${YAHOO_PATH}`;
  const url = new URL(base);
  url.searchParams.set("symbols", ticker);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "lucid-stock-price-agent/1.0"
      }
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Upstream quote source returned HTTP ${response.status}`);
  }

  const body = (await response.json()) as YahooQuoteApiResponse;
  const quote = body?.quoteResponse?.result?.[0];

  if (!quote) {
    throw new Error(`Ticker ${ticker} not found`);
  }

  const timestampMs = asFiniteNumber(quote.regularMarketTime, 0) > 0
    ? asFiniteNumber(quote.regularMarketTime) * 1000
    : Date.now();

  return {
    ticker: String(quote.symbol ?? ticker).toUpperCase(),
    price: asFiniteNumber(quote.regularMarketPrice),
    change: asFiniteNumber(quote.regularMarketChange),
    change_pct: asFiniteNumber(quote.regularMarketChangePercent),
    volume: Math.trunc(asFiniteNumber(quote.regularMarketVolume)),
    timestamp: new Date(timestampMs).toISOString()
  };
}