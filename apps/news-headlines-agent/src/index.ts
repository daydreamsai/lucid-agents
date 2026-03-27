import * as LucidHttp from "@lucid-agents/http";
import { loadConfig } from "./config";
import { json } from "./http";
import { fetchTopHeadlines, isValidCategory, VALID_CATEGORIES } from "./news";
import { paymentRequiredResponse, validatePaymentHeader } from "./x402";

const config = loadConfig();

function parseCount(raw: string | null): number | null {
  if (raw === null) return 5;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1 || value > 20) return null;
  return value;
}

async function handleHeadlines(request: Request, url: URL): Promise<Response> {
  const paymentResult = await validatePaymentHeader(request, url, config);
  if (!paymentResult.ok) {
    return paymentRequiredResponse(request, url, config, paymentResult.reason);
  }

  const categoryRaw = url.searchParams.get("category");
  if (!categoryRaw) {
    return json(400, {
      error: "Missing required query parameter: category",
      validCategories: VALID_CATEGORIES,
    });
  }

  const category = categoryRaw.toLowerCase();
  if (!isValidCategory(category)) {
    return json(400, {
      error: `Invalid category "${categoryRaw}"`,
      validCategories: VALID_CATEGORIES,
    });
  }

  const count = parseCount(url.searchParams.get("count"));
  if (count === null) {
    return json(400, {
      error: 'Invalid "count". Must be an integer between 1 and 20.',
    });
  }

  try {
    const articles = await fetchTopHeadlines({
      apiKey: config.newsApiKey,
      category,
      count,
    });

    return json(200, { articles });
  } catch (error) {
    return json(502, {
      error: "Failed to fetch headlines from NewsAPI",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function router(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/") {
    return json(200, {
      name: "news-headlines-lucid-agent",
      endpoint: "/headlines?category=technology&count=5",
      priceUsd: config.x402PriceUsd,
      categories: VALID_CATEGORIES,
    });
  }

  if (request.method === "GET" && url.pathname === "/headlines") {
    return handleHeadlines(request, url);
  }

  return json(404, { error: "Not found" });
}

function startServer() {
  const handler = (req: Request) => router(req);
  const maybeServe = (LucidHttp as { serve?: (options: { port: number; fetch: typeof handler }) => unknown }).serve;

  if (typeof maybeServe === "function") {
    try {
      maybeServe({ port: config.port, fetch: handler });
      console.log(`[news-headlines-agent] using @lucid-agents/http on port ${config.port}`);
      return;
    } catch (error) {
      console.warn(
        `[news-headlines-agent] @lucid-agents/http serve() failed, falling back to Bun.serve: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  Bun.serve({ port: config.port, fetch: handler });
  console.log(`[news-headlines-agent] listening on port ${config.port}`);
}

startServer();