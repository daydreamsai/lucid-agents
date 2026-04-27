import {
  createX402Fetch,
  type WrappedFetch,
  type X402Account,
} from "@lucid-agents/payments";
import {
  ForensicsArgsSchema,
  PreflightArgsSchema,
  WatchSecretArgsSchema,
  WatchSubscribeArgsSchema,
  type ForensicsArgs,
  type PreflightArgs,
  type WatchSecretArgs,
  type WatchSubscribeArgs,
} from "./schemas";
import type {
  CatalogDecoysResponse,
  ForensicsResponse,
  PaidResponse,
  PaymentReceipt,
  PreflightResponse,
  WatchStatusResponse,
  WatchSubscribeResponse,
  WatchUnsubscribeResponse,
} from "./types";

const DEFAULT_BASE_URL = "https://x402station.io";
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Validates the configured base URL points at the canonical x402station
 * domain (or a localhost dev URL — IPv4 OR IPv6). Any other host throws
 * so a misconfigured agent can't sign x402 payments against an
 * attacker-controlled URL. Mirrors the allow-list shipped in the
 * official `x402station-mcp` npm package.
 *
 * IPv6 loopback `[::1]` is included so dual-stack dev machines that
 * bind their oracle to `::1` work. Caught by Greptile review on the
 * Daydreams Lucid PR (2026-04-27).
 */
function resolveBaseUrl(raw: string | undefined): string {
  const value = (raw ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new Error(`@lucid-agents/x402station: baseUrl is not a valid URL: ${value}`);
  }
  // u.host (NOT u.hostname) so a non-default port doesn't bypass the
  // allow-list — `https://x402station.io:9999`.hostname === "x402station.io"
  // but `.host === "x402station.io:9999"`. For IPv6 the host comes back
  // bracketed (e.g. `[::1]:3002`), which is what the startsWith match
  // wants.
  const isCanonical = u.host === "x402station.io" && u.protocol === "https:";
  const isLocalDev =
    (u.host.startsWith("localhost") ||
      u.host.startsWith("127.0.0.1") ||
      u.host.startsWith("[::1]")) &&
    (u.protocol === "http:" || u.protocol === "https:");
  if (!isCanonical && !isLocalDev) {
    throw new Error(
      `@lucid-agents/x402station: baseUrl must be https://x402station.io or a localhost dev URL; got "${value}". ` +
        "Refusing to sign x402 payments against an unknown host.",
    );
  }
  return value;
}

/**
 * Decodes the settled-payment receipt header. When the header is
 * present but the body fails decode (non-base64, non-JSON, or a
 * stripped proxy mangled it), returns `{ raw, malformed: true }` so
 * audit code can branch on `malformed` rather than silently get a
 * stub object that satisfies the type but lacks `transaction`/
 * `network`/`payer`. Greptile P2 (2026-04-27).
 */
function decodeReceipt(headers: Headers): PaymentReceipt | null {
  const raw =
    headers.get("x-payment-response") ?? headers.get("payment-response");
  if (!raw) return null;
  try {
    return JSON.parse(atob(raw)) as PaymentReceipt;
  } catch {
    return { raw, malformed: true };
  }
}

export interface X402StationOptions {
  /** Account that signs x402 challenges (`account.signTypedData` is invoked). */
  account: X402Account;
  /** Override base URL. Only `https://x402station.io` or `http(s)://localhost*` accepted. */
  baseUrl?: string;
  /** Custom fetch (mostly for tests). Default: global `fetch`. */
  fetchImpl?: typeof fetch;
  /**
   * Per-call timeout. Aborts the underlying fetch if the oracle takes
   * longer than this — without it a stalled network turns into a stuck
   * agent (the Node default socket timeout is minutes). Greptile P2
   * (2026-04-27). Default: 30 000 ms.
   */
  timeoutMs?: number;
}

/**
 * Pre-flight oracle client for x402 endpoints. Wraps the public oracle at
 * [x402station.io](https://x402station.io) — six methods covering safety
 * checks, deep history, blacklist pulls, and webhook subscriptions on
 * endpoint state changes.
 *
 * Networks: Base mainnet (`eip155:8453`) and Base Sepolia
 * (`eip155:84532`). Payments auto-signed through the configured
 * `X402Account`.
 *
 * @example
 * ```ts
 * import { x402Station } from "@lucid-agents/x402station";
 *
 * const oracle = x402Station({ account });
 * const r = await oracle.preflight({ url: targetUrl });
 * if (!r.result.ok) {
 *   // refuse to pay; r.result.warnings tells you why
 *   return;
 * }
 * ```
 */
export class X402Station {
  private readonly baseUrl: string;
  private readonly fetchPaid: WrappedFetch;
  private readonly fetchFree: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: X402StationOptions) {
    this.baseUrl = resolveBaseUrl(options.baseUrl);
    this.fetchPaid = createX402Fetch({
      account: options.account,
      fetchImpl: options.fetchImpl,
    });
    this.fetchFree = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Pre-flight safety check. $0.001 USDC. */
  async preflight(
    args: PreflightArgs,
  ): Promise<PaidResponse<PreflightResponse>> {
    const parsed = PreflightArgsSchema.parse(args);
    return this.callPaid<PreflightResponse>("/api/v1/preflight", {
      url: parsed.url,
    });
  }

  /** 7-day forensics report. $0.001 USDC. Superset of preflight. */
  async forensics(
    args: ForensicsArgs,
  ): Promise<PaidResponse<ForensicsResponse>> {
    const parsed = ForensicsArgsSchema.parse(args);
    return this.callPaid<ForensicsResponse>("/api/v1/forensics", {
      url: parsed.url,
    });
  }

  /** Full known-bad blacklist as one cacheable JSON. $0.005 USDC. */
  async catalogDecoys(): Promise<PaidResponse<CatalogDecoysResponse>> {
    return this.callPaid<CatalogDecoysResponse>("/api/v1/catalog/decoys", {});
  }

  /**
   * Webhook-subscription helpers. `subscribe` is paid ($0.01 = 30-day
   * watch + 100 prepaid HMAC-signed alerts); `status` and
   * `unsubscribe` are free + secret-gated by the secret returned from
   * `subscribe`.
   */
  watch = {
    subscribe: async (
      args: WatchSubscribeArgs,
    ): Promise<PaidResponse<WatchSubscribeResponse>> => {
      const parsed = WatchSubscribeArgsSchema.parse(args);
      const body: Record<string, unknown> = {
        url: parsed.url,
        webhookUrl: parsed.webhookUrl,
      };
      if (parsed.signals && parsed.signals.length > 0) {
        body.signals = parsed.signals;
      }
      return this.callPaid<WatchSubscribeResponse>("/api/v1/watch", body);
    },
    status: async (args: WatchSecretArgs): Promise<WatchStatusResponse> => {
      const parsed = WatchSecretArgsSchema.parse(args);
      return this.callFree<WatchStatusResponse>(
        `/api/v1/watch/${parsed.watchId}`,
        "GET",
        parsed.secret,
      );
    },
    unsubscribe: async (
      args: WatchSecretArgs,
    ): Promise<WatchUnsubscribeResponse> => {
      const parsed = WatchSecretArgsSchema.parse(args);
      return this.callFree<WatchUnsubscribeResponse>(
        `/api/v1/watch/${parsed.watchId}`,
        "DELETE",
        parsed.secret,
      );
    },
  };

  private async callPaid<T>(path: string, body: unknown): Promise<PaidResponse<T>> {
    let r: Response;
    try {
      r = await this.fetchPaid(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      // AbortError fires on timeout; surface it with the path + budget
      // so agents see "timed out after 30000ms calling /api/v1/preflight"
      // not a generic "the operation was aborted".
      if ((e as { name?: string }).name === "AbortError" || (e as { name?: string }).name === "TimeoutError") {
        throw new Error(
          `[@lucid-agents/x402station] ${path} timed out after ${this.timeoutMs}ms`,
        );
      }
      throw e;
    }
    const paymentReceipt = decodeReceipt(r.headers);
    const raw = await r.text();
    if (!r.ok) {
      const snippet = raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
      throw new Error(
        `[@lucid-agents/x402station] ${path} returned ${r.status}: ${snippet}`,
      );
    }
    let result: T;
    try {
      result = JSON.parse(raw) as T;
    } catch {
      throw new Error(
        `[@lucid-agents/x402station] ${path} returned 200 with non-JSON body (first 200 chars): ${raw.slice(0, 200)}`,
      );
    }
    return { result, paymentReceipt };
  }

  private async callFree<T>(
    path: string,
    method: "GET" | "DELETE",
    secret: string,
  ): Promise<T> {
    let r: Response;
    try {
      r = await this.fetchFree(`${this.baseUrl}${path}`, {
        method,
        headers: { "x-x402station-secret": secret },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError" || (e as { name?: string }).name === "TimeoutError") {
        throw new Error(
          `[@lucid-agents/x402station] ${method} ${path} timed out after ${this.timeoutMs}ms`,
        );
      }
      throw e;
    }
    const raw = await r.text();
    if (!r.ok) {
      const snippet = raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
      throw new Error(
        `[@lucid-agents/x402station] ${method} ${path} returned ${r.status}: ${snippet}`,
      );
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new Error(
        `[@lucid-agents/x402station] ${method} ${path} returned 200 with non-JSON body (first 200 chars): ${raw.slice(0, 200)}`,
      );
    }
  }
}

/**
 * Factory helper.
 *
 * @param options - Account + optional base URL / fetch override.
 * @returns Configured `X402Station` client.
 */
export function x402Station(options: X402StationOptions): X402Station {
  return new X402Station(options);
}
