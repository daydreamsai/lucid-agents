import { NEWS_API_BASE, NEWS_API_COUNTRY, NEWS_API_KEY } from "./runtime-config";
import type { Category, HeadlineArticle } from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function assertNewsApiKey(): void {
  if (!NEWS_API_KEY || NEWS_API_KEY === "REPLACE_WITH_NEWSAPI_KEY") {
    throw new Error("NEWS_API_KEY is not configured.");
  }
}

export async function fetchTopHeadlines(category: Category, count: number): Promise<HeadlineArticle[]> {
  assertNewsApiKey();

  const params = new URLSearchParams({
    apiKey: NEWS_API_KEY,
    category,
    country: NEWS_API_COUNTRY,
    pageSize: String(count),
  });

  const response = await fetch(`${NEWS_API_BASE}/top-headlines?${params.toString()}`, {
    method: "GET",
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`NewsAPI request failed (${response.status}): ${text}`);
  }

  const payloadUnknown: unknown = await response.json();
  const payload = asRecord(payloadUnknown);
  if (!payload) {
    throw new Error("Invalid NewsAPI payload.");
  }

  const status = payload["status"];
  if (status !== "ok") {
    const message = readString(payload["message"]) ?? "Unknown NewsAPI error";
    throw new Error(message);
  }

  const articlesUnknown = payload["articles"];
  if (!Array.isArray(articlesUnknown)) {
    throw new Error("NewsAPI payload missing articles array.");
  }

  const articles: HeadlineArticle[] = [];

  for (const articleUnknown of articlesUnknown) {
    const article = asRecord(articleUnknown);
    if (!article) {
      continue;
    }

    const title = readString(article["title"]);
    const url = readString(article["url"]);
    if (!title || !url) {
      continue;
    }

    const source = asRecord(article["source"]);
    const sourceName = readString(source?.["name"]) ?? "Unknown";
    const publishedAt = readString(article["publishedAt"]) ?? "";

    articles.push({
      title,
      source: sourceName,
      url,
      publishedAt,
    });

    if (articles.length >= count) {
      break;
    }
  }

  return articles;
}