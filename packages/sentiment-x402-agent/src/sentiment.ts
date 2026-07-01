import type { AppConfig, SentimentKind, SentimentLabel, SentimentResult } from "./types";

const MEANING_CLOUD_ENDPOINT = "https://api.meaningcloud.com/sentiment-2.1";
const TEXT_PROCESSING_ENDPOINT = "http://text-processing.com/api/sentiment/";

type MeaningCloudResponse = {
  status?: { code?: string; msg?: string };
  score_tag?: string;
  confidence?: string;
};

type TextProcessingResponse = {
  label?: string;
  probability?: {
    neg?: string;
    neutral?: string;
    pos?: string;
  };
};

const LABELS: ReadonlySet<SentimentLabel> = new Set(["P+", "P", "NEU", "N", "N+", "NONE"]);

export async function analyzeSentiment(text: string, cfg: AppConfig): Promise<SentimentResult> {
  const normalized = text.trim();

  if (!normalized) {
    throw new Error("Text cannot be empty.");
  }

  if (normalized.length > 5000) {
    throw new Error("Text cannot exceed 5000 characters.");
  }

  if (cfg.sentimentProvider === "meaningcloud") {
    return analyzeWithMeaningCloud(normalized, cfg);
  }

  if (cfg.sentimentProvider === "text-processing") {
    return analyzeWithTextProcessing(normalized, cfg);
  }

  if (cfg.meaningCloudApiKey) {
    try {
      return await analyzeWithMeaningCloud(normalized, cfg);
    } catch {
      return analyzeWithTextProcessing(normalized, cfg);
    }
  }

  return analyzeWithTextProcessing(normalized, cfg);
}

async function analyzeWithMeaningCloud(text: string, cfg: AppConfig): Promise<SentimentResult> {
  if (!cfg.meaningCloudApiKey) {
    throw new Error("Missing MEANINGCLOUD_API_KEY.");
  }

  const form = new URLSearchParams({
    key: cfg.meaningCloudApiKey,
    txt: text,
    lang: "en"
  });

  const payload = await fetchJsonWithTimeout<MeaningCloudResponse>(
    MEANING_CLOUD_ENDPOINT,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: form.toString()
    },
    cfg.requestTimeoutMs
  );

  if (payload.status?.code && payload.status.code !== "0") {
    throw new Error(`MeaningCloud error: ${payload.status.msg ?? payload.status.code}`);
  }

  const label = normalizeLabel(payload.score_tag ?? "NONE");
  const confidenceRaw = Number(payload.confidence);
  const confidence = Number.isFinite(confidenceRaw) ? confidenceRaw / 100 : undefined;
  const score = confidence ?? defaultScoreForLabel(label);

  return toResult(label, score);
}

async function analyzeWithTextProcessing(text: string, cfg: AppConfig): Promise<SentimentResult> {
  const form = new URLSearchParams({ text });

  const payload = await fetchJsonWithTimeout<TextProcessingResponse>(
    TEXT_PROCESSING_ENDPOINT,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: form.toString()
    },
    cfg.requestTimeoutMs
  );

  const rawLabel = String(payload.label ?? "").toLowerCase();
  const probs = payload.probability ?? {};
  const pPos = safeNumber(probs.pos);
  const pNeg = safeNumber(probs.neg);
  const pNeu = safeNumber(probs.neutral);

  if (rawLabel === "pos") {
    return toResult("P+", pPos ?? 0.92);
  }

  if (rawLabel === "neg") {
    return toResult("N+", pNeg ?? 0.92);
  }

  return toResult("NEU", pNeu ?? 0.5);
}

async function fetchJsonWithTimeout<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    const data = safeJsonParse(text);

    if (!res.ok) {
      throw new Error(`Upstream request failed (${res.status}): ${text}`);
    }

    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Sentiment provider timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function toResult(label: SentimentLabel, score: number): SentimentResult {
  return {
    label,
    sentiment: mapLabelToKind(label),
    score: round2(clamp01(score))
  };
}

function mapLabelToKind(label: SentimentLabel): SentimentKind {
  if (label === "P+" || label === "P") {
    return "positive";
  }

  if (label === "N+" || label === "N") {
    return "negative";
  }

  return "neutral";
}

function normalizeLabel(value: string): SentimentLabel {
  const upper = value.toUpperCase();

  if (LABELS.has(upper as SentimentLabel)) {
    return upper as SentimentLabel;
  }

  return "NONE";
}

function defaultScoreForLabel(label: SentimentLabel): number {
  switch (label) {
    case "P+":
      return 0.92;
    case "P":
      return 0.75;
    case "NEU":
      return 0.5;
    case "N":
      return 0.25;
    case "N+":
      return 0.08;
    default:
      return 0.5;
  }
}

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    throw new Error("Provider returned invalid JSON.");
  }
}

function safeNumber(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return undefined;
  }
  return n;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}