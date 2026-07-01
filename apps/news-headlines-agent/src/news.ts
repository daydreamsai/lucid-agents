export const VALID_CATEGORIES = [
  "business",
  "technology",
  "science",
  "health",
  "sports",
  "entertainment",
] as const;

export type HeadlineCategory = (typeof VALID_CATEGORIES)[number];

const CATEGORY_SET = new Set<string>(VALID_CATEGORIES);

export interface HeadlineArticle {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
}

interface NewsApiArticle {
  title: string | null;
  url: string | null;
  publishedAt: string | null;
  source: {
    id: string | null;
    name: string | null;
  };
}

interface NewsApiTopHeadlinesResponse {
  status: "ok" | "error";
  totalResults?: number;
  articles?: NewsApiArticle[];
  code?: string;
  message?: string;
}

export function isValidCategory(value: string): value is HeadlineCategory {
  return CATEGORY_SET.has(value);
}

export async function fetchTopHeadlines(args: {
  apiKey: string;
  category: HeadlineCategory;
  count: number;
  signal?: AbortSignal;
}): Promise<HeadlineArticle[]> {
  const params = new URLSearchParams({
    country: "us",
    category: args.category,
    pageSize: String(args.count),
  });

  const response = await fetch(`https://newsapi.org/v2/top-headlines?${params.toString()}`, {
    method: "GET",
    headers: {
      "X-Api-Key": args.apiKey,
    },
    signal: args.signal,
  });

  if (!response.ok) {
    const rawError = await response.text();
    throw new Error(`NewsAPI request failed (${response.status}): ${rawError}`);
  }

  const body = (await response.json()) as NewsApiTopHeadlinesResponse;
  if (body.status !== "ok") {
    throw new Error(body.message || "NewsAPI returned a non-ok response");
  }

  return (body.articles ?? []).slice(0, args.count).map((article) => ({
    title: article.title ?? "",
    source: article.source?.name ?? "Unknown",
    url: article.url ?? "",
    publishedAt: article.publishedAt ?? "",
  }));
}