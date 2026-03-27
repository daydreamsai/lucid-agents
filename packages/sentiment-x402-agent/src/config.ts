import { z } from "zod";
import type { AppConfig, SentimentProvider } from "./types";

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  PRICE_USD: z.coerce.number().positive().default(0.001),
  X402_SECRET: z.string().min(16).default("change-me-in-production"),
  SENTIMENT_PROVIDER: z
    .enum(["auto", "meaningcloud", "text-processing"] satisfies [SentimentProvider, ...SentimentProvider[]])
    .default("auto"),
  MEANINGCLOUD_API_KEY: z.string().optional(),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10000)
});

const parsed = envSchema.parse(process.env);

if (parsed.SENTIMENT_PROVIDER === "meaningcloud" && !parsed.MEANINGCLOUD_API_KEY) {
  throw new Error("SENTIMENT_PROVIDER=meaningcloud requires MEANINGCLOUD_API_KEY");
}

export const config: AppConfig = {
  port: parsed.PORT,
  priceUsd: parsed.PRICE_USD,
  x402Secret: parsed.X402_SECRET,
  sentimentProvider: parsed.SENTIMENT_PROVIDER,
  meaningCloudApiKey: parsed.MEANINGCLOUD_API_KEY,
  requestTimeoutMs: parsed.REQUEST_TIMEOUT_MS
};