import yahooFinance from "yahoo-finance2";
import type { StockQuoteResponse } from "./types";

export class TickerNotFoundError extends Error {
  constructor(ticker: string) {
    super(`Ticker not found: ${ticker}`);
    this.name = "TickerNotFoundError";
  }
}

export class UpstreamServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamServiceError";
  }
}

const CACHE_TTL_MS = Number(process.env.STOCK_CACHE_TTL_MS ?? 5000);
const REQUEST_TIMEOUT_MS = Number(process.env.STOCK_REQUEST_TIMEOUT_MS ?? 10000);

const cache = new Map<string, { expiresAt: number; data: StockQuoteResponse }>();

export function isValidTicker(ticker: string): boolean {
  return /^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker);
}

function toNumber(value: unknown, fallback: number = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function toIsoTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return toIsoTimestamp(parsed);
    }
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  return new Date().toISOString();
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function getStockQuote(ticker: string): Promise<StockQuoteResponse> {
  const symbol = ticker.toUpperCase();
  const now = Date.now();

  const cached = cache.get(symbol);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  let quote: Record<string, unknown>;
  try {
    quote = (await withTimeout(
      yahooFinance.quote(symbol) as Promise<Record<string, unknown>>,
      REQUEST_TIMEOUT_MS
    )) ?? {};
  } catch (error) {
    throw new UpstreamServiceError(
      error instanceof Error ? `Market data provider error: ${error.message}` : "Market data provider error"
    );
  }

  const regularMarketPrice = toNumber(quote.regularMarketPrice, Number.NaN);
  if (!Number.isFinite(regularMarketPrice)) {
    throw new TickerNotFoundError(symbol);
  }

  const payload: StockQuoteResponse = {
    ticker: String(quote.symbol ?? symbol).toUpperCase(),
    price: regularMarketPrice,
    change: toNumber(quote.regularMarketChange, 0),
    change_pct: toNumber(quote.regularMarketChangePercent, 0),
    volume: Math.trunc(toNumber(quote.regularMarketVolume, 0)),
    timestamp: toIsoTimestamp(quote.regularMarketTime)
  };

  cache.set(symbol, {
    expiresAt: now + (Number.isFinite(CACHE_TTL_MS) && CACHE_TTL_MS > 0 ? CACHE_TTL_MS : 5000),
    data: payload
  });

  return payload;
}