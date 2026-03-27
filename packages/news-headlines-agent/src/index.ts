import * as LucidHttp from "@lucid-agents/http";
import * as LucidPayments from "@lucid-agents/payments";

const VALID_CATEGORIES = [
  "business",
  "technology",
  "science",
  "health",
  "sports",
  "entertainment",
] as const;

type Category = (typeof VALID_CATEGORIES)[number];

interface NewsApiArticle {
  title?: string;
  url?: string;
  publishedAt?: string;
  source?: {
    name?: string;
  };
}

interface NewsApiResponse {
  status: string;
  message?: string;
  articles?: NewsApiArticle[];
}

interface Headline {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
}

interface PaymentVerifier {
  name: string;
  verify: (request: Request) => Promise<boolean>;
}

const VALID_CATEGORY_SET = new Set<string>(VALID_CATEGORIES);
const DEFAULT_PORT = 3000;
const DEFAULT_COUNT = 5;
const MAX_COUNT = 20;
const DEFAULT_CATEGORY: Category = "technology";
const NEWS_API_URL = "https://newsapi.org/v2/top-headlines";
const FALLBACK_PAYMENT_HEADER = "x402-payment";

const NEWSAPI_KEY = process.env.NEWSAPI_KEY?.trim() ?? "";
const NEWS_COUNTRY = process.env.NEWS_COUNTRY?.trim() || "us";
const X402_PRICE_USD = process.env.X402_PRICE_USD?.trim() || "0.001";
const FALLBACK_PAYMENT_TOKEN =
  process.env.X402_TEST_TOKEN?.trim() || "paid-demo-token";

function jsonResponse(
  payload: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function parseCategory(rawCategory: string | null): Category | null {
  const category = (rawCategory ?? DEFAULT_CATEGORY).trim().toLowerCase();
  if (!VALID_CATEGORY_SET.has(category)) {
    return null;
  }
  return category as Category;
}

function parseCount(rawCount: string | null): number | null {
  if (rawCount === null || rawCount.trim() === "") {
    return DEFAULT_COUNT;
  }

  const parsed = Number.parseInt(rawCount, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    return null;
  }
  if (parsed < 1 || parsed > MAX_COUNT) {
    return null;
  }

  return parsed;
}

function normalizePaymentResult(result: unknown): boolean {
  if (typeof result === "boolean") {
    return result;
  }

  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;

    if (typeof record.ok === "boolean") return record.ok;
    if (typeof record.valid === "boolean") return record.valid;
    if (typeof record.paid === "boolean") return record.paid;

    if (typeof record.status === "string") {
      const status = record.status.toLowerCase();
      return status === "paid" || status === "ok" || status === "valid";
    }
  }

  return false;
}

function createPaymentVerifier(): PaymentVerifier {
  const paymentsModule = LucidPayments as Record<string, unknown>;
  const verifierFactoryKeys = [
    "createX402Verifier",
    "createPaymentVerifier",
    "createVerifier",
  ];
  const directVerifierKeys = ["verifyX402Payment", "verifyPayment"];

  for (const key of verifierFactoryKeys) {
    const maybeFactory = paymentsModule[key];
    if (typeof maybeFactory !== "function") {
      continue;
    }

    try {
      const built = (maybeFactory as (...args: unknown[]) => unknown)({
        priceUsd: Number.parseFloat(X402_PRICE_USD),
      });

      if (typeof built === "function") {
        return {
          name: `@lucid-agents/payments:${key}(fn)`,
          verify: async (request: Request) => {
            const result = await (built as (req: Request) => unknown)(request);
            return normalizePaymentResult(result);
          },
        };
      }

      if (built && typeof built === "object") {
        const verifyMethod = (built as Record<string, unknown>).verify;
        if (typeof verifyMethod === "function") {
          return {
            name: `@lucid-agents/payments:${key}(verify)`,
            verify: async (request: Request) => {
              const result = await (verifyMethod as (req: Request) => unknown)(
                request,
              );
              return normalizePaymentResult(result);
            },
          };
        }
      }
    } catch {
      // Move to next strategy.
    }
  }

  for (const key of directVerifierKeys) {
    const maybeDirect = paymentsModule[key];
    if (typeof maybeDirect !== "function") {
      continue;
    }

    return {
      name: `@lucid-agents/payments:${key}`,
      verify: async (request: Request) => {
        const result = await (maybeDirect as (...args: unknown[]) => unknown)(
          request,
          { priceUsd: Number.parseFloat(X402_PRICE_USD) },
        );
        return normalizePaymentResult(result);
      },
    };
  }

  return {
    name: "header-token-fallback",
    verify: async (request: Request) => {
      const rawAuth = request.headers.get("authorization");
      const bearerToken = rawAuth?.toLowerCase().startsWith("bearer ")
        ? rawAuth.slice(7).trim()
        : null;

      const candidateTokens = [
        request.headers.get(FALLBACK_PAYMENT_HEADER),
        request.headers.get("x-payment"),
        request.headers.get("payment"),
        bearerToken,
      ];

      return candidateTokens.some(
        (token) => (token?.trim() ?? "") === FALLBACK_PAYMENT_TOKEN,
      );
    },
  };
}

async function fetchHeadlines(
  category: Category,
  count: number,
): Promise<Headline[]> {
  if (!NEWSAPI_KEY) {
    throw new Error("Missing NEWSAPI_KEY.");
  }

  const endpoint = new URL(NEWS_API_URL);
  endpoint.searchParams.set("category", category);
  endpoint.searchParams.set("pageSize", String(count));
  endpoint.searchParams.set("country", NEWS_COUNTRY);

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "X-Api-Key": NEWSAPI_KEY,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `News API request failed (${response.status}): ${errorText || "unknown error"}`,
    );
  }

  const payload = (await response.json()) as NewsApiResponse;
  if (payload.status !== "ok") {
    throw new Error(payload.message || "News API returned a non-ok status.");
  }

  const articles = payload.articles ?? [];
  return articles.slice(0, count).map((article) => ({
    title: article.title?.trim() || "Untitled",
    source: article.source?.name?.trim() || "Unknown",
    url: article.url?.trim() || "",
    publishedAt: article.publishedAt?.trim() || "",
  }));
}

function paymentRequiredResponse(): Response {
  return jsonResponse(
    {
      error: "payment_required",
      message: "x402 payment required",
      priceUsd: Number.parseFloat(X402_PRICE_USD),
      paymentHeader: FALLBACK_PAYMENT_HEADER,
    },
    402,
    {
      "x402-required": "true",
      "x402-price-usd": X402_PRICE_USD,
      "x402-payment-header": FALLBACK_PAYMENT_HEADER,
    },
  );
}

async function handleHeadlinesRequest(
  request: Request,
  url: URL,
  verifier: PaymentVerifier,
): Promise<Response> {
  const paid = await verifier.verify(request);
  if (!paid) {
    return paymentRequiredResponse();
  }

  const category = parseCategory(url.searchParams.get("category"));
  if (!category) {
    return jsonResponse(
      {
        error: "invalid_category",
        validCategories: VALID_CATEGORIES,
      },
      400,
    );
  }

  const count = parseCount(url.searchParams.get("count"));
  if (count === null) {
    return jsonResponse(
      {
        error: "invalid_count",
        message: `count must be an integer between 1 and ${MAX_COUNT}`,
      },
      400,
    );
  }

  try {
    const articles = await fetchHeadlines(category, count);

    return jsonResponse(
      { articles },
      200,
      {
        "x402-status": "paid",
        "x402-price-usd": X402_PRICE_USD,
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown upstream error";
    return jsonResponse(
      {
        error: "news_fetch_failed",
        message,
      },
      502,
    );
  }
}

async function router(
  request: Request,
  verifier: PaymentVerifier,
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    return jsonResponse({ ok: true });
  }

  if (request.method === "GET" && url.pathname === "/headlines") {
    return handleHeadlinesRequest(request, url, verifier);
  }

  if (request.method === "GET" && url.pathname === "/") {
    return jsonResponse({
      name: "news-headlines-lucid-agent",
      endpoints: ["GET /headlines?category=technology&count=5", "GET /health"],
      validCategories: VALID_CATEGORIES,
      x402PriceUsd: Number.parseFloat(X402_PRICE_USD),
    });
  }

  return jsonResponse({ error: "not_found" }, 404);
}

async function startHttpServer(
  port: number,
  fetchHandler: (request: Request) => Promise<Response>,
): Promise<void> {
  const httpModule = LucidHttp as Record<string, unknown>;

  const strategies: Array<{
    key: string;
    name: string;
    invoke: (fn: (...args: unknown[]) => unknown) => unknown;
  }> = [
    {
      key: "serve",
      name: "serve({ port, fetch })",
      invoke: (fn) => fn({ port, fetch: fetchHandler }),
    },
    {
      key: "serve",
      name: "serve(fetch, { port })",
      invoke: (fn) => fn(fetchHandler, { port }),
    },
    {
      key: "createServer",
      name: "createServer({ port, fetch })",
      invoke: (fn) => fn({ port, fetch: fetchHandler }),
    },
    {
      key: "startServer",
      name: "startServer({ port, fetch })",
      invoke: (fn) => fn({ port, fetch: fetchHandler }),
    },
  ];

  for (const strategy of strategies) {
    const maybeFn = httpModule[strategy.key];
    if (typeof maybeFn !== "function") {
      continue;
    }

    try {
      const result = strategy.invoke(
        maybeFn as (...args: unknown[]) => unknown,
      );

      if (result && typeof result === "object") {
        const listen = (result as { listen?: unknown }).listen;
        if (typeof listen === "function") {
          (listen as (arg?: unknown) => unknown)(port);
        }
      }

      console.info(
        `[http] started with @lucid-agents/http via ${strategy.name} on port ${port}`,
      );
      return;
    } catch {
      // Try next strategy.
    }
  }

  Bun.serve({
    port,
    fetch: fetchHandler,
  });

  console.info(`[http] started with Bun.serve fallback on port ${port}`);
}

const verifier = createPaymentVerifier();
const port = Number.parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);

console.info(
  `[boot] payment verifier=${verifier.name}, x402 price=$${X402_PRICE_USD}, news country=${NEWS_COUNTRY}`,
);

await startHttpServer(port, (request) => router(request, verifier));