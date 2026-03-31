import { env } from "./env";
import type {
  MeaningCloudSentimentResponse,
  SentimentAnalysisResponse,
  SentimentPolarity
} from "./types";

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_TEXT_LENGTH = 5_000;

function mapScoreTagToSentiment(scoreTag: string | undefined): SentimentPolarity {
  switch (scoreTag) {
    case "P+":
    case "P":
      return "positive";
    case "N+":
    case "N":
      return "negative";
    default:
      return "neutral";
  }
}

function fallbackMagnitudeForTag(scoreTag: string): number {
  switch (scoreTag) {
    case "P+":
    case "N+":
      return 0.95;
    case "P":
    case "N":
      return 0.75;
    case "NEU":
      return 0;
    default:
      return 0.5;
  }
}

function toSignedScore(sentiment: SentimentPolarity, magnitude: number): number {
  const clamped = Math.max(0, Math.min(1, magnitude));
  if (sentiment === "negative") {
    return Number((-clamped).toFixed(2));
  }
  if (sentiment === "neutral") {
    return 0;
  }
  return Number(clamped.toFixed(2));
}

export async function analyzeSentiment(text: string): Promise<SentimentAnalysisResponse> {
  const normalized = text.trim();

  if (!normalized) {
    throw new Error("Field 'text' must be a non-empty string.");
  }

  if (normalized.length > MAX_TEXT_LENGTH) {
    throw new Error(`Field 'text' is too long. Maximum length is ${MAX_TEXT_LENGTH} characters.`);
  }

  const body = new URLSearchParams();
  body.set("key", env.MEANINGCLOUD_API_KEY);
  body.set("txt", normalized);
  body.set("lang", "auto");

  const response = await fetch(env.SENTIMENT_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: body.toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(`Sentiment provider request failed with status ${response.status}.`);
  }

  const providerJson = (await response.json()) as MeaningCloudSentimentResponse;

  if (!providerJson.status || providerJson.status.code !== "0") {
    const code = providerJson.status?.code ?? "unknown";
    const message = providerJson.status?.msg ?? "Unknown provider error";
    throw new Error(`Sentiment provider returned error ${code}: ${message}`);
  }

  const label = providerJson.score_tag ?? "NONE";
  const sentiment = mapScoreTagToSentiment(label);
  const parsedConfidence = Number.parseFloat(providerJson.confidence ?? "");
  const magnitude = Number.isFinite(parsedConfidence)
    ? parsedConfidence / 100
    : fallbackMagnitudeForTag(label);

  return {
    sentiment,
    score: toSignedScore(sentiment, magnitude),
    label
  };
}