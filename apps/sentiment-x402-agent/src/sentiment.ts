import { config } from "./config";

export type SentimentClass = "positive" | "negative" | "neutral" | "mixed";

export interface SentimentAnalysis {
  readonly sentiment: SentimentClass;
  readonly score: number;
  readonly label: string;
}

interface ProviderStatus {
  code?: string;
  msg?: string;
}

interface ProviderResponse {
  status?: ProviderStatus;
  score_tag?: string;
  confidence?: string | number;
}

const LABEL_DEFAULT_SCORE: Record<string, number> = {
  "P+": 0.92,
  P: 0.78,
  NEU: 0.5,
  N: 0.22,
  "N+": 0.08,
  NONE: 0.5
};

function roundScore(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  const clamped = Math.max(0, Math.min(1, value));
  return Number(clamped.toFixed(2));
}

function labelToSentiment(label: string): SentimentClass {
  switch (label) {
    case "P+":
    case "P":
      return "positive";
    case "N+":
    case "N":
      return "negative";
    case "NEU":
    case "NONE":
      return "neutral";
    default:
      return "mixed";
  }
}

function normalizeLabel(raw: string | undefined): string {
  if (!raw) return "NONE";
  return raw.toUpperCase().trim();
}

function confidenceToScore(confidence: string | number | undefined): number | null {
  if (typeof confidence === "number" && Number.isFinite(confidence)) {
    return confidence > 1 ? confidence / 100 : confidence;
  }

  if (typeof confidence === "string") {
    const parsed = Number(confidence);
    if (Number.isFinite(parsed)) {
      return parsed > 1 ? parsed / 100 : parsed;
    }
  }

  return null;
}

async function analyzeWithProvider(text: string): Promise<SentimentAnalysis> {
  const form = new URLSearchParams();
  form.set("key", config.sentimentApiKey);
  form.set("txt", text);
  form.set("lang", config.sentimentApiLang);

  const response = await fetch(config.sentimentApiEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString()
  });

  if (!response.ok) {
    throw new Error(`Sentiment provider request failed with status ${response.status}`);
  }

  const data = (await response.json()) as ProviderResponse;
  if (data.status?.code && data.status.code !== "0") {
    throw new Error(data.status.msg ?? `Sentiment provider failed with code ${data.status.code}`);
  }

  const label = normalizeLabel(data.score_tag);
  const sentiment = labelToSentiment(label);
  const confidenceScore = confidenceToScore(data.confidence);
  const defaultScore = LABEL_DEFAULT_SCORE[label] ?? 0.5;

  return {
    sentiment,
    score: roundScore(confidenceScore ?? defaultScore),
    label
  };
}

const POSITIVE_WORDS = new Set([
  "love",
  "great",
  "excellent",
  "awesome",
  "amazing",
  "good",
  "fantastic",
  "happy",
  "like",
  "best",
  "perfect"
]);

const NEGATIVE_WORDS = new Set([
  "hate",
  "bad",
  "terrible",
  "awful",
  "poor",
  "worst",
  "horrible",
  "sad",
  "dislike",
  "broken",
  "useless"
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function heuristicAnalyze(text: string): SentimentAnalysis {
  const tokens = tokenize(text);
  let positive = 0;
  let negative = 0;

  for (const token of tokens) {
    if (POSITIVE_WORDS.has(token)) positive += token === "love" || token === "perfect" ? 2 : 1;
    if (NEGATIVE_WORDS.has(token)) negative += token === "hate" || token === "worst" ? 2 : 1;
  }

  const total = positive + negative;
  if (total === 0) {
    return { sentiment: "neutral", score: 0.5, label: "NEU" };
  }

  const polarity = (positive - negative) / total;
  const score = roundScore((polarity + 1) / 2);

  if (polarity >= 0.6) return { sentiment: "positive", score, label: "P+" };
  if (polarity >= 0.2) return { sentiment: "positive", score, label: "P" };
  if (polarity <= -0.6) return { sentiment: "negative", score, label: "N+" };
  if (polarity <= -0.2) return { sentiment: "negative", score, label: "N" };
  return { sentiment: "neutral", score, label: "NEU" };
}

export async function analyzeSentiment(text: string): Promise<SentimentAnalysis> {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error("Text cannot be empty.");
  }

  if (config.sentimentApiEndpoint.length > 0 && config.sentimentApiKey.length > 0) {
    try {
      return await analyzeWithProvider(trimmed);
    } catch {
      return heuristicAnalyze(trimmed);
    }
  }

  return heuristicAnalyze(trimmed);
}