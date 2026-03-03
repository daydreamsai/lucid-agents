import { describe, expect, it, mock } from 'bun:test';

import { createSolanaReputationRegistryClient } from '../registries/reputation';

function makeMockSdk(overrides: Record<string, unknown> = {}) {
  return {
    getAgentReputationFromIndexer: mock(async () => ({
      avg_score: 85,
      trust_tier: 3,
      feedback_count: 12,
    })),
    giveFeedback: mock(async () => ({ signature: 'feedsig123' })),
    revokeFeedback: mock(async () => ({ signature: 'revokesig456' })),
    ...overrides,
  } as any;
}

const ASSET_ADDR = 'AgentAsset11111111111111111111111111111111';

describe('createSolanaReputationRegistryClient', () => {
  describe('getSummary', () => {
    it('returns summary with score and tier', async () => {
      const sdk = makeMockSdk();
      const client = createSolanaReputationRegistryClient(sdk);
      const result = await client.getSummary(ASSET_ADDR);
      expect(result?.score).toBe(85);
      expect(result?.feedbackCount).toBe(12);
      expect(result?.tier).toBe('3'); // Gold tier index
      expect(result?.assetAddress).toBe(ASSET_ADDR);
    });

    it('returns null when indexer returns null', async () => {
      const sdk = makeMockSdk({
        getAgentReputationFromIndexer: mock(async () => null),
      });
      const client = createSolanaReputationRegistryClient(sdk);
      const result = await client.getSummary(ASSET_ADDR);
      expect(result).toBeNull();
    });

    it('rethrows SDK errors so callers distinguish outages from missing data', async () => {
      const sdk = makeMockSdk({
        getAgentReputationFromIndexer: mock(async () => {
          throw new Error('network error');
        }),
      });
      const client = createSolanaReputationRegistryClient(sdk);
      await expect(client.getSummary(ASSET_ADDR)).rejects.toThrow(
        'getSummary: failed to fetch reputation'
      );
    });

    it('handles null avg_score gracefully', async () => {
      const sdk = makeMockSdk({
        getAgentReputationFromIndexer: mock(async () => ({
          avg_score: null,
          trust_tier: 0,
          feedback_count: 0,
        })),
      });
      const client = createSolanaReputationRegistryClient(sdk);
      const result = await client.getSummary(ASSET_ADDR);
      expect(result?.score).toBeNull();
      expect(result?.feedbackCount).toBe(0);
    });
  });

  describe('giveFeedback', () => {
    it('calls sdk.giveFeedback and returns signature', async () => {
      const sdk = makeMockSdk();
      const client = createSolanaReputationRegistryClient(sdk);
      const result = await client.giveFeedback({
        targetAddress: ASSET_ADDR,
        score: 90,
        tag1: 'reliable',
        tag2: 'fast',
        comment: 'Completed task successfully',
      });
      expect(result.signature).toBe('feedsig123');
      expect(sdk.giveFeedback).toHaveBeenCalledWith(
        ASSET_ADDR,
        expect.objectContaining({ value: 90 })
      );
    });

    it('handles feedback with minimal options', async () => {
      const sdk = makeMockSdk();
      const client = createSolanaReputationRegistryClient(sdk);
      const result = await client.giveFeedback({
        targetAddress: ASSET_ADDR,
        score: 70,
      });
      expect(result.signature).toBe('feedsig123');
    });

    it('omits metricUri when comment is absent', async () => {
      const sdk = makeMockSdk();
      const client = createSolanaReputationRegistryClient(sdk);
      await client.giveFeedback({ targetAddress: ASSET_ADDR, score: 50 });
      const call = (sdk.giveFeedback as ReturnType<typeof mock>).mock.calls[0];
      expect(call[1]).not.toHaveProperty('metricUri');
    });
  });

  describe('revokeFeedback', () => {
    it('calls sdk.revokeFeedback and returns signature', async () => {
      const sdk = makeMockSdk();
      const client = createSolanaReputationRegistryClient(sdk);
      const result = await client.revokeFeedback({
        assetAddress: ASSET_ADDR,
        feedbackIndex: 0,
      });
      expect(result.signature).toBe('revokesig456');
      expect(sdk.revokeFeedback).toHaveBeenCalledWith(ASSET_ADDR, 0);
    });

    it('supports bigint feedback index', async () => {
      const sdk = makeMockSdk();
      const client = createSolanaReputationRegistryClient(sdk);
      const result = await client.revokeFeedback({
        assetAddress: ASSET_ADDR,
        feedbackIndex: 3n,
      });
      expect(result.signature).toBe('revokesig456');
    });
  });
});

describe('giveFeedback (input validation)', () => {
  it('throws for score > 100', async () => {
    const sdk = makeMockSdk();
    const client = createSolanaReputationRegistryClient(sdk);
    await expect(
      client.giveFeedback({ targetAddress: ASSET_ADDR, score: 101 })
    ).rejects.toThrow('invalid score 101');
  });

  it('throws for negative score', async () => {
    const sdk = makeMockSdk();
    const client = createSolanaReputationRegistryClient(sdk);
    await expect(
      client.giveFeedback({ targetAddress: ASSET_ADDR, score: -1 })
    ).rejects.toThrow('invalid score -1');
  });
});

describe('revokeFeedback (input validation)', () => {
  it('throws for negative feedbackIndex', async () => {
    const sdk = makeMockSdk();
    const client = createSolanaReputationRegistryClient(sdk);
    await expect(
      client.revokeFeedback({ assetAddress: ASSET_ADDR, feedbackIndex: -1 })
    ).rejects.toThrow('invalid feedbackIndex');
  });
});
