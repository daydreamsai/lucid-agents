/**
 * Thin wrapper around 8004-solana's reputation capabilities.
 */

import type { SolanaSDK as SolanaSDKType } from '8004-solana';

export type SolanaReputationSummary = {
  agentId: bigint | number;
  score: number;
  tier: string;
  feedbackCount: number;
};

export type GiveFeedbackOptions = {
  toAgentId: bigint | number;
  value: number;
  valueDecimals?: number;
  tag1?: string;
  tag2?: string;
  endpoint?: string;
};

export type SolanaReputationRegistryClient = {
  getSummary(agentId: bigint | number): Promise<SolanaReputationSummary | null>;
  giveFeedback(opts: GiveFeedbackOptions): Promise<{ signature?: string }>;
  revokeFeedback(feedbackId: string): Promise<{ signature?: string }>;
};

/**
 * Create a Solana reputation registry client wrapping SolanaSDK.
 */
export function createSolanaReputationRegistryClient(
  sdk: SolanaSDKType
): SolanaReputationRegistryClient {
  return {
    async getSummary(agentId) {
      try {
        const summary = await sdk.getReputationSummary(BigInt(agentId));
        if (!summary) return null;
        const tier = await sdk.getTrustTier?.(BigInt(agentId));
        return {
          agentId,
          score: (summary as any)?.score ?? 0,
          tier: String(tier ?? 'Unrated'),
          feedbackCount: (summary as any)?.feedbackCount ?? 0,
        };
      } catch {
        return null;
      }
    },

    async giveFeedback(opts) {
      const result = await sdk.giveFeedback({
        toAgentId: BigInt(opts.toAgentId),
        value: opts.value,
        valueDecimals: opts.valueDecimals ?? 0,
        tag1: opts.tag1 ?? '',
        tag2: opts.tag2 ?? '',
        endpoint: opts.endpoint ?? '',
      } as any);
      return { signature: (result as any)?.signature ?? (result as any)?.tx };
    },

    async revokeFeedback(feedbackId) {
      const result = await sdk.revokeFeedback?.(feedbackId as any);
      return { signature: (result as any)?.signature ?? (result as any)?.tx };
    },
  };
}
