export interface SentimentRequestBody {
  text: string;
}

export type SentimentPolarity = "positive" | "negative" | "neutral";

export interface SentimentAnalysisResponse {
  sentiment: SentimentPolarity;
  score: number;
  label: string;
}

export interface MeaningCloudStatus {
  code: string;
  msg: string;
  credits?: string;
  remaining_credits?: string;
}

export interface MeaningCloudSentimentResponse {
  status: MeaningCloudStatus;
  score_tag?: string;
  agreement?: string;
  confidence?: string;
  irony?: string;
  subjectivity?: string;
  [key: string]: unknown;
}