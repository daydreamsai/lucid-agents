/**
 * Thin wrapper around 8004-solana's reputation capabilities.
 * Uses a typed local adapter to avoid @ts-ignore and scattered any casts.
 */

import { SolanaSDK } from '8004-solana';

// ── Local SDK adapter types ─────────────────────────────────────────────────
// These mirror the relevant subset of the 8004-solana SDK so the wrapper is
// fully typed without repeating the peer-dep's entire interface.

type IndexerSummary = {
  avg_score?: number | null;
  trust_tier?: string | number | null;
  feedback_count?: number | null;
};

type TxResult = { signature?: string; tx?: string } | null | undefined;

type SolanaReputationSdkAdapter = {
  getAgentReputationFromIndexer(
    assetAddress: string
  ): Promise<IndexerSummary | null | undefined>;
  giveFeedback(
    targetAddress: string,
    params: {
      value: number;
      tag1: string;
      tag2: string;
      metricUri?: string;
    }
  ): Promise<TxResult>;
  revokeFeedback(
    assetAddress: string,
    feedbackIndex: number | bigint
  ): Promise<TxResult>;
};

// ── Public types ─────────────────────────────────────────────────────────────

export type SolanaReputationSummary = {
  /** Agent's on-chain asset address */
  assetAddress: string;
  /** Average score (0–100) or null when no feedbacks yet */
  score: number | null;
  /** Trust tier name (Unrated, Bronze, Silver, Gold, Platinum) */
  tier: string;
  feedbackCount: number;
};

export type GiveFeedbackOptions = {
  /**
   * Agent asset address (on-chain MPL Core asset pubkey, base58-encoded).
   * When submitting feedback after a task, this is the agent that performed the work.
   */
  targetAddress: string;
  /** Feedback score (0–100, inclusive) */
  score: number;
  /** Optional comment / URI describing the feedback context */
  comment?: string;
  /** Optional tag1 metadata */
  tag1?: string;
  /** Optional tag2 metadata */
  tag2?: string;
};

export type RevokeFeedbackOptions = {
  /** Agent asset address (base58-encoded) */
  assetAddress: string;
  /** Feedback index to revoke — must be a non-negative integer */
  feedbackIndex: number | bigint;
};

export type SolanaReputationRegistryClient = {
  getSummary(assetAddress: string): Promise<SolanaReputationSummary | null>;
  giveFeedback(opts: GiveFeedbackOptions): Promise<{ signature?: string }>;
  revokeFeedback(opts: RevokeFeedbackOptions): Promise<{ signature?: string }>;
};

/**
 * Create a Solana reputation registry client wrapping SolanaSDK.
 */
export function createSolanaReputationRegistryClient(
  sdk: InstanceType<typeof SolanaSDK>
): SolanaReputationRegistryClient {
  // Cast once to the typed adapter — keeps individual call sites clean.
  const reputationSdk = sdk as unknown as SolanaReputationSdkAdapter;

  return {
    async getSummary(assetAddress) {
      // Only return null when the agent genuinely has no reputation record.
      // SDK/network failures are rethrown so callers can distinguish
      // "not found" from "service unavailable".
      let indexerData: IndexerSummary | null | undefined;
      try {
        indexerData =
          await reputationSdk.getAgentReputationFromIndexer(assetAddress);
      } catch (err: unknown) {
        throw new Error(
          `getSummary: failed to fetch reputation for asset ${assetAddress}: ` +
            (err instanceof Error ? err.message : String(err))
        );
      }
      if (!indexerData) return null;
      return {
        assetAddress,
        score:
          typeof indexerData.avg_score === 'number'
            ? indexerData.avg_score
            : null,
        tier: String(indexerData.trust_tier ?? 'Unrated'),
        feedbackCount:
          typeof indexerData.feedback_count === 'number'
            ? indexerData.feedback_count
            : 0,
      };
    },

    async giveFeedback(opts) {
      if (
        typeof opts.score !== 'number' ||
        !Number.isFinite(opts.score) ||
        opts.score < 0 ||
        opts.score > 100
      ) {
        throw new Error(
          `giveFeedback: invalid score ${opts.score}. Must be a finite number in [0, 100].`
        );
      }

      const result = await reputationSdk.giveFeedback(opts.targetAddress, {
        value: opts.score,
        tag1: opts.tag1 ?? '',
        tag2: opts.tag2 ?? '',
        ...(opts.comment ? { metricUri: opts.comment } : {}),
      });
      return { signature: result?.signature ?? result?.tx };
    },

    async revokeFeedback(opts) {
      const idx = opts.feedbackIndex;
      const idxNum = typeof idx === 'bigint' ? Number(idx) : idx;
      if (!Number.isInteger(idxNum) || idxNum < 0) {
        throw new Error(
          `revokeFeedback: invalid feedbackIndex ${opts.feedbackIndex}. Must be a non-negative integer.`
        );
      }

      const result = await reputationSdk.revokeFeedback(
        opts.assetAddress,
        opts.feedbackIndex
      );
      return { signature: result?.signature ?? result?.tx };
    },
  };
}
