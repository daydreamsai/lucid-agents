import { z } from "zod";

/**
 * Signal vocabulary. Whitelisted at the schema level so a typo in a
 * subscriber's `signals` array gets caught before the wallet round-trip.
 */
export const SignalSchema = z.enum([
  "unknown_endpoint",
  "no_history",
  "dead",
  "zombie",
  "decoy_price_extreme",
  "suspicious_high_price",
  "slow",
  "new_provider",
  "dead_7d",
  "mostly_dead",
  "slow_p99",
  "price_outlier_high",
  "high_concentration",
]);

export const PreflightArgsSchema = z.object({
  url: z.string().url(),
});

export const ForensicsArgsSchema = PreflightArgsSchema;

export const WatchSubscribeArgsSchema = z.object({
  // Target URL the agent wants to monitor. Stays http(s)-agnostic so an
  // operator can probe an http-only endpoint they're considering paying.
  url: z.string().url(),
  // Webhook delivery target. HTTPS-only — the oracle ships HMAC-SHA256-
  // signed alert payloads here, and a plain-HTTP target would expose
  // both the payload and the signature to any network observer (replay
  // is then trivial; forgery still requires the per-watch secret, but
  // the privacy hit is not acceptable). Caught by Greptile review on
  // the Daydreams Lucid PR (2026-04-27).
  webhookUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://"), {
      message:
        "webhookUrl must use HTTPS — HMAC-signed alert payloads must not travel in clear text",
    }),
  signals: z.array(SignalSchema).min(1).max(20).optional(),
});

export const WatchSecretArgsSchema = z.object({
  watchId: z.string().uuid(),
  secret: z
    .string()
    .length(64)
    .regex(/^[0-9a-f]{64}$/i, "secret must be 64 hex chars"),
});

// Catalog diff polling. `since` is an ISO 8601 timestamp (default = now()
// - 24h, cap 30 days back). `limit` caps each of added_endpoints[] and
// removed_endpoints[] (1..500, default 200).
export const WhatsNewArgsSchema = z.object({
  since: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

// Routing-fallback. At least one of `url` or `taskClass` is required.
// The route returns 400 if both are missing.
export const AlternativesArgsSchema = z
  .object({
    url: z.string().url().optional(),
    taskClass: z.string().max(80).optional(),
    limit: z.number().int().min(1).max(10).optional(),
  })
  .refine((v) => v.url !== undefined || v.taskClass !== undefined, {
    message: "alternatives requires at least one of `url` or `taskClass`",
  });

export type PreflightArgs = z.infer<typeof PreflightArgsSchema>;
export type ForensicsArgs = z.infer<typeof ForensicsArgsSchema>;
export type WatchSubscribeArgs = z.infer<typeof WatchSubscribeArgsSchema>;
export type WatchSecretArgs = z.infer<typeof WatchSecretArgsSchema>;
export type AlternativesArgs = z.infer<typeof AlternativesArgsSchema>;
export type WhatsNewArgs = z.infer<typeof WhatsNewArgsSchema>;
