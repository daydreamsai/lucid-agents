import type { PaymentRecord, PaymentTracker } from '../payments';

/**
 * Analytics runtime that reads from payment tracker.
 */
export type AnalyticsRuntime = {
  /** Payment tracker instance */
  readonly paymentTracker: PaymentTracker | undefined;
};

/**
 * Analytics summary for a time window.
 */
export type AnalyticsSummary = {
  /** Total outgoing payments in base units */
  outgoingTotal: bigint;
  /** Total incoming payments in base units */
  incomingTotal: bigint;
  /** Net (incoming - outgoing) in base units */
  netTotal: bigint;
  /** Number of outgoing transactions */
  outgoingCount: number;
  /** Number of incoming transactions */
  incomingCount: number;
  /** Time window start (timestamp) */
  windowStart?: number;
  /** Time window end (timestamp) */
  windowEnd?: number;
};

/**
 * Transaction record for analytics.
 */
export type Transaction = PaymentRecord & {
  /** Formatted amount in USDC (e.g., "1.5" for 1.5 USDC) */
  amountUsdc: string;
  /** Formatted timestamp (ISO string) */
  timestampIso: string;
};

/**
 * Full analytics data structure.
 */
export type AnalyticsData = {
  /** Summary statistics */
  summary: AnalyticsSummary;
  /** All transactions */
  transactions: Transaction[];
};
