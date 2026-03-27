export const PRICE_USD = 0.001;
export const DEFAULT_COUNT = 5;
export const MAX_COUNT = 20;

function parsePort(raw: string | undefined): number {
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) {
    return parsed;
  }
  return 3000;
}

export const PORT = parsePort(process.env.PORT);
export const HOST = process.env.HOST ?? "0.0.0.0";

export const NEWS_API_BASE = process.env.NEWS_API_BASE ?? "https://newsapi.org/v2";
export const NEWS_API_KEY = process.env.NEWS_API_KEY ?? "REPLACE_WITH_NEWSAPI_KEY";
export const NEWS_COUNTRY = process.env.NEWS_COUNTRY ?? "us";

export const X402_VALID_TOKEN = process.env.X402_VALID_TOKEN ?? "taskmarket-demo-paid";