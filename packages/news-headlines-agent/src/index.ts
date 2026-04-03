import { DEFAULT_COUNT, HOST, MAX_COUNT, PORT } from "./config";
import { json } from "./http";
import { fetchTopHeadlines } from "./newsapi";
import { ensurePaid } from "./payments";
import type { Category } from "./types";
import { VALID_CATEGORIES } from "./types";

class HttpError extends Error {
  public readonly status: number;

  public constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const validCategories = new Set<string>(VALID_CATEGORIES);

function isCategory(value: string): value is Category {
  return validCategories.has(value);
}

function parseCount(raw: string | null): number {
  if (!raw || raw.trim() === "") {
    return DEFAULT_COUNT;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_COUNT) {
    throw new HttpError(400, `Invalid count. Use an integer between 1 and ${MAX_COUNT}.`);
  }

  return parsed;
}

function methodNotAllowed(allowed: string[]): Response {
  return json(
    { error: "Method not allowed" },
    {
      status: 405,
      headers: { allow: allowed.join(", ") },
    },
  );
}

async function handleHeadlines(request: Request, url: URL): Promise<Response> {
  const paymentGate = await ensurePaid(request);
  if (paymentGate) {
    return paymentGate;
  }

  const categoryRaw = url.searchParams.get("category");
  if (!categoryRaw || !isCategory(categoryRaw)) {
    throw new HttpError(
      400,
      "Invalid category. Valid categories: business, technology, science, health, sports, entertainment.",
    );
  }

  const count = parseCount(url.searchParams.get("count"));
  const articles = await fetchTopHeadlines(categoryRaw, count);

  return json({ articles }, { status: 200 });
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/health") {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    return json({ ok: true }, { status: 200 });
  }

  if (path === "/headlines") {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    try {
      return await handleHeadlines(request, url);
    } catch (error: unknown) {
      if (error instanceof HttpError) {
        return json({ error: error.message }, { status: error.status });
      }

      const message = error instanceof Error ? error.message : "Unexpected error";
      return json({ error: "Failed to fetch headlines", message }, { status: 502 });
    }
  }

  if (path === "/") {
    return json(
      {
        name: "news-headlines-lucid-agent",
        endpoints: {
          health: "GET /health",
          headlines: "GET /headlines?category=technology&count=5",
        },
        x402: {
          required: true,
          priceUsd: 0.001,
        },
      },
      { status: 200 },
    );
  }

  return json({ error: "Not found" }, { status: 404 });
}

export function startServer(): void {
  const server = Bun.serve({
    hostname: HOST,
    port: PORT,
    fetch: handleRequest,
  });

  // eslint-disable-next-line no-console
  console.log(`[news-headlines-agent] listening on http://${server.hostname}:${server.port}`);
}

if (import.meta.main) {
  startServer();
}