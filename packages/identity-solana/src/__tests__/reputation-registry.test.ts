import { describe, expect, it, mock } from 'bun:test';

import { createSolanaReputationRegistryClient } from '../registries/reputation';

function makeMockSdk(overrides: Record<string, unknown> = {}) {
  return {
    getReputationSummary: mock(async () => ({ score: 85, feedbackCount: 12 })),
    getTrustTier: mock(async () => 3), // Gold
    giveFeedback: mock(async () => ({ signature: 'feedsig123' })),
    revokeFeedback: mock(async () => ({ signature: 'revokesig456' })),
    ...overrides,
  } as any;
}

describe('createSolanaReputationRegistryClient', () => {
  describe('getSummary', () => {
    it('returns summary with score and tier', async () => {
      const sdk = makeMockSdk();
      const client = createSolanaReputationRegistryClient(sdk);
      const result = await client.getSummary(1n);
      expect(result?.score).toBe(85);
      expect(result?.feedbackCount).toBe(12);
      expect(result?.tier).toBe('3'); // Gold tier value
    });

    it('returns null when no summary found', async () => {
      const sdk = makeMockSdk({
        getReputationSummary: mock(async () => null),
      });
      const client = createSolanaReputationRegistryClient(sdk);
      const result = await client.getSummary(999n);
      expect(result).toBeNull();
    });

    it('returns null on SDK error', async () => {
      const sdk = makeMockSdk({
        getReputationSummary: mock(async () => { throw new Error('not found'); }),
      });
      const client = createSolanaReputationRegistryClient(sdk);
      const result = await client.getSummary(1n);
      expect(result).toBeNull();
    });
  });

  describe('giveFeedback', () => {
    it('calls sdk.giveFeedback and returns signature', async () => {
      const sdk = makeMockSdk();
      const client = createSolanaReputationRegistryClient(sdk);
      const result = await client.giveFeedback({
        toAgentId: 42n,
        value: 90,
        tag1: 'reliable',
        tag2: 'fast',
        endpoint: 'https://agent.example.com',
      });
      expect(result.signature).toBe('feedsig123');
      expect(sdk.giveFeedback).toHaveBeenCalled();
    });

    it('handles feedback with defaults', async () => {
      const sdk = makeMockSdk();
      const client = createSolanaReputationRegistryClient(sdk);
      await expect(
        client.giveFeedback({ toAgentId: 1n, value: 70 })
      ).resolves.toBeDefined();
    });
  });

  describe('revokeFeedback', () => {
    it('calls sdk.revokeFeedback and returns signature', async () => {
      const sdk = makeMockSdk();
      const client = createSolanaReputationRegistryClient(sdk);
      const result = await client.revokeFeedback('feedback-id-123');
      expect(result.signature).toBe('revokesig456');
      expect(sdk.revokeFeedback).toHaveBeenCalled();
    });
  });
});
