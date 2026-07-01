import { z } from "zod";

// Pure (no DNS) host check for `webhookUrl` on watch.subscribe. Fails
// fast LOCAL when the operator passes a private/loopback/cloud-metadata
// host, before the call reaches the x402station server (which has its
// own SSRF guard at /api/v1/watch). Defense-in-depth, audit-2026-04-29
// recon-7 HIGH-8.
function isPrivateIPv4(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return false;
  const a = Number.parseInt(m[1]!, 10);
  const b = Number.parseInt(m[2]!, 10);
  const c = Number.parseInt(m[3]!, 10);
  const d = Number.parseInt(m[4]!, 10);
  if ([a, b, c, d].some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}
function isPrivateIPv6(host: string): boolean {
  let h = host.toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  if (h === "::" || h === "::1") return true;
  if (/^fe[89ab]/.test(h)) return true;
  if (/^f[cd]/.test(h)) return true;
  if (/^ff/.test(h)) return true;
  if (h.startsWith("::ffff:")) return true;
  if (h.startsWith("::") && h.length > 2 && /^::[0-9a-f]/.test(h)) return true;
  if (h.startsWith("64:ff9b:")) return true;
  if (h.startsWith("100:")) return true;
  if (h.startsWith("2001:db8")) return true;
  if (/^3fff/.test(h)) return true;
  if (h.startsWith("2001:2:") || h.startsWith("2001:0002:")) return true;
  if (h.startsWith("5f00:")) return true;
  if (h.startsWith("2002:")) return true;
  if (h.startsWith("2001::") || /^2001:0+:/.test(h)) return true;
  return false;
}
const LOCALHOST_NAMES = new Set(["localhost", "localhost.localdomain"]);
/**
 * Returns the rejection reason as a string when `rawUrl` should be refused,
 * or `null` when the URL is acceptable for use as a webhookUrl. Plain
 * `string | null` (rather than a discriminated union) so the dts build of
 * downstream packages doesn't trip on TS narrowing inside zod superRefine
 * blocks.
 */
export function validateWebhookUrl(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return "invalid URL";
  }
  if (u.protocol !== "https:") {
    return "webhookUrl must use HTTPS — HMAC-signed alert payloads must not travel in clear text";
  }
  if (u.username !== "" || u.password !== "") {
    return "webhookUrl must not contain userinfo (user:pass@host) — known phishing/spoofing vector";
  }
  const hostname = u.hostname.toLowerCase();
  if (LOCALHOST_NAMES.has(hostname)) {
    return `webhookUrl hostname is loopback (${hostname})`;
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
    if (isPrivateIPv4(hostname)) {
      return `webhookUrl IPv4 ${hostname} is loopback / private / link-local / cloud-metadata`;
    }
  }
  if (hostname.startsWith("[")) {
    if (isPrivateIPv6(hostname)) {
      return `webhookUrl IPv6 ${hostname} is loopback / ULA / link-local / v4-mapped / NAT64`;
    }
  }
  return null;
}

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
    .superRefine((u, ctx) => {
      const reason = validateWebhookUrl(u);
      if (reason !== null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: reason });
      }
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

// Bulk-preflight credits. v1 has no parameters — fixed $0.50 / 1000 calls.
export const BuyCreditsArgsSchema = z.object({});

// Read a credit's balance + expiry. UUID-only access; the id is the bearer
// token returned by buyCredits.
export const CreditsStatusArgsSchema = z.object({
  creditId: z.string().uuid(),
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
export type BuyCreditsArgs = z.infer<typeof BuyCreditsArgsSchema>;
export type CreditsStatusArgs = z.infer<typeof CreditsStatusArgsSchema>;
