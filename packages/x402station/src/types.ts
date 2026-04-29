/**
 * Signal vocabulary returned by x402station's preflight + forensics
 * endpoints. **Bold** signals are critical (flip `ok` to `false`).
 */
export type Signal =
  | "unknown_endpoint"
  | "no_history"
  | "dead"                  // critical
  | "zombie"                // critical
  | "decoy_price_extreme"   // critical
  | "suspicious_high_price"
  | "slow"
  | "new_provider"
  | "dead_7d"               // critical (forensics-only)
  | "mostly_dead"           // critical (forensics-only)
  | "slow_p99"
  | "price_outlier_high"
  | "high_concentration";

/**
 * Settled-payment receipt. Returned alongside every paid response so
 * the agent can audit on-chain spend. Decoded from the
 * `x-payment-response` (or `payment-response`) header.
 *
 * If the header is present but the body fails base64 / JSON decode (e.g.
 * a misconfigured proxy stripped the encoding), the client falls back to
 * `{ raw, malformed: true }` rather than silently returning a stub —
 * agents auditing spend can branch on `malformed` to surface the issue.
 */
export interface PaymentReceipt {
  transaction?: string;
  network?: string;
  payer?: string;
  /** Raw header value, populated only when decode failed. */
  raw?: string;
  /** True when the receipt header was present but couldn't be decoded. */
  malformed?: boolean;
  [key: string]: unknown;
}

/**
 * Common metadata block returned by preflight + forensics.
 */
export interface EndpointMetadata {
  url: string;
  service?: string;
  service_id?: string;
  provider?: string | null;
  price_usdc?: string | null;
  currency?: string | null;
  is_active?: boolean;
  uptime_1h_pct?: number | null;
  avg_latency_ms?: number | null;
  endpoint_first_seen?: string;
  service_first_seen?: string;
}

export interface PreflightResponse {
  ok: boolean;
  warnings: Signal[];
  metadata: EndpointMetadata;
}

export interface ForensicsHourBucket {
  bucket: string;
  probes: number;
  healthy: number;
  avg_latency_ms: number | null;
}

export interface ForensicsResponse {
  ok: boolean;
  warnings: Signal[];
  decoy_probability: number;
  metadata: EndpointMetadata;
  uptime: {
    probes_7d: number;
    healthy_7d: number;
    errors_7d: number;
    uptime_7d_pct: number;
    uptime_1h_pct: number;
    avg_latency_1h_ms: number | null;
    hourly: ForensicsHourBucket[];
  };
  latency: {
    p50_ms: number | null;
    p90_ms: number | null;
    p99_ms: number | null;
    max_ms: number | null;
  };
  status_codes: Record<string, number>;
  concentration: {
    group_size: number;
    catalog_total: number;
    concentration_pct: number;
    group_median_price_usdc: string | null;
    group_p90_price_usdc: string | null;
    price_ratio_to_median: number | null;
  };
}

export interface CatalogDecoyEntry {
  url: string;
  service_id: string;
  service_name: string;
  provider: string | null;
  price_usdc: string | null;
  currency: string | null;
  reasons: Array<"decoy_price_extreme" | "zombie" | "dead_7d" | "mostly_dead">;
  probes_7d: number;
  healthy_7d: number;
  uptime_7d_pct: number | null;
  last_probe_at: string | null;
}

export interface CatalogDecoysResponse {
  generated_at: string;
  counts: {
    total: number;
    by_reason: Record<string, number>;
  };
  truncated: boolean;
  entries: CatalogDecoyEntry[];
}

export interface AlternativeEntry {
  url: string;
  service: string | null;
  service_id: string | null;
  provider: string | null;
  domain: string | null;
  category: string | null;
  price_usdc: string | null;
  currency: string | null;
  uptime_1h_pct: number | null;
  uptime_7d_pct: number | null;
  avg_latency_1h_ms: number | null;
  match_reason:
    | "same_service"
    | "same_provider"
    | "same_domain"
    | "same_category"
    | "similar_price";
}

export interface BuyCreditsResponse {
  creditId: string;
  balance: number;
  initialBalance: number;
  paidAmount: string;
  payerAddress: string | null;
  createdAt: string;
  expiresAt: string;
  usage: Record<string, unknown>;
}

export interface CreditsStatusResponse {
  creditId: string;
  balance: number;
  initialBalance: number;
  used: number;
  paidAmount: string;
  payerAddress: string | null;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
  paymentTx: string | null;
  paymentNetwork: string | null;
}

export interface WhatsNewEndpoint {
  url: string;
  service_id: string;
  service_name: string;
  provider: string | null;
  domain: string | null;
  category: string | null;
  price_usdc: string | null;
  currency: string | null;
  first_seen_at?: string;
  last_seen_at?: string;
}

export interface WhatsNewResponse {
  since: string;
  until: string;
  window_hours: number;
  added_endpoints: WhatsNewEndpoint[];
  removed_endpoints: WhatsNewEndpoint[];
  summary: {
    added_endpoints_count: number;
    removed_endpoints_count: number;
    added_services_count: number;
    removed_services_count: number;
    polls_in_window: number;
    first_poll_at: string | null;
    last_poll_at: string | null;
    current_active_endpoints: number;
    current_active_services: number;
  };
  truncated: boolean;
  limit: number;
}

export interface AlternativesResponse {
  target:
    | {
        url: string;
        service?: string | null;
        service_id?: string | null;
        provider?: string | null;
        category?: string | null;
        price_usdc?: string | null;
        currency?: string | null;
        known?: boolean;
      }
    | { task_class: string };
  match_strategy: "url_target" | "task_class_only" | "url_target_unknown_fallback";
  alternatives: AlternativeEntry[];
  candidate_count: number;
}

export interface WatchSubscribeResponse {
  watchId: string;
  /** 64-char hex secret. Returned ONCE — store it. HMAC seed for verifying delivery payloads. */
  secret: string;
  expiresAt: string;
  signals: Signal[];
  alertsPaid: number;
  alertsRemaining: number;
  endpointKnown: boolean;
  deliveryFormat: {
    method: string;
    headers: Record<string, string>;
    signatureScheme: string;
    retryPolicy: string;
    examplePayload: unknown;
  };
  statusUrl: string;
  unsubscribeUrl: string;
}

export interface WatchAlertSnapshot {
  id: string;
  firedSignals: Signal[];
  clearedSignals: Signal[];
  currentState: unknown;
  createdAt: string;
  deliveredAt: string | null;
  deliveryStatus: "pending" | "delivered" | "failed" | "skipped_quota_exceeded";
  deliveryAttempts: number;
  deliveryResponseCode: number | null;
}

export interface WatchStatusResponse {
  watchId: string;
  endpointUrl: string;
  webhookUrl: string;
  signals: Signal[];
  createdAt: string;
  expiresAt: string;
  alertsPaid: number;
  alertsSent: number;
  alertsRemaining: number;
  lastState: unknown;
  isActive: boolean;
  expired: boolean;
  recentAlerts: WatchAlertSnapshot[];
}

export interface WatchUnsubscribeResponse {
  watchId: string;
  isActive: false;
  message: string;
}

/**
 * Wraps a paid response with its payment receipt for spend auditing.
 */
export interface PaidResponse<T> {
  result: T;
  paymentReceipt: PaymentReceipt | null;
}
