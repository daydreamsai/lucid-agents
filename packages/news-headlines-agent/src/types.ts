export const VALID_CATEGORIES = [
  "business",
  "technology",
  "science",
  "health",
  "sports",
  "entertainment",
] as const;

export type Category = (typeof VALID_CATEGORIES)[number];

export interface HeadlineArticle {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
}