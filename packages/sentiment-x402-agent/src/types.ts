export type SentimentLabel = "P+" | "P" | "NEU" | "N" | "N+" | "NONE";
export type SentimentKind = "positive" | "neutral" | "negative";
export type SentimentProvider = "auto" | "meaningcloud" | "text-processing";

export interface SentimentResult {
  sentiment: SentimentKind;
  score: number;
  label: SentimentLabel;
}

export interface AppConfig {
  port: number;
  priceUsd: number;
  x402Secret: string;
  sentimentProvider: SentimentProvider;
  meaningCloudApiKey?: string;
  requestTimeoutMs: number;
}