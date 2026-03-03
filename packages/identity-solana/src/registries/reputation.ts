/**
 * Thin wrapper around 8004-solana's reputation capabilities.
 */

// @ts-ignore — 8004-solana is a peer dependency
import { SolanaSDK } from '8004-solana';

export type SolanaReputationSummary = {
  /** Agent's on-chain asset address */
  assetAddress: string;
  /** Average score (0-100) or null when no feedbacks yet */
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
  /** Feedback score (0-100) */
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
  /** Feedback index to revoke */
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
  return {
    async getSummary(assetAddress) {
      try {
        // Use indexer-based reputation (avoids PublicKey construction in wrapper)
        const indexerData = await (sdk as any).getAgentReputationFromIndexer(
          assetAddress as any
        );
        if (!indexerData) return null;
        return {
          assetAddress,
          score: indexerData.avg_score ?? null,
          tier: String(indexerData.trust_tier ?? 'Unrated'),
          feedbackCount: indexerData.feedback_count ?? 0,
        };
      } catch {
        return null;
      }
    },

    async giveFeedback(opts) {
      // sdk.giveFeedback(asset: PublicKey, params: GiveFeedbackParams, options?)
      // We cast the address string to `any` to avoid importing PublicKey at build time.
      const result = await (sdk as any).giveFeedback(
        opts.targetAddress as any,
        {
          value: opts.score,
          tag1: opts.tag1 ?? '',
          tag2: opts.tag2 ?? '',
          ...(opts.comment ? { metricUri: opts.comment } : {}),
        }
      );
      return {
        signature: (result as any)?.signature ?? (result as any)?.tx,
      };
    },

    async revokeFeedback(opts) {
      // sdk.revokeFeedback(asset: PublicKey, feedbackIndex, sealHash?, options?)
      const result = await (sdk as any).revokeFeedback(
        opts.assetAddress as any,
        opts.feedbackIndex
      );
      return {
        signature: (result as any)?.signature ?? (result as any)?.tx,
      };
    },
  };
}
