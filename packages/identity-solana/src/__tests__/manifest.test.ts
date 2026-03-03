import type { TrustConfig } from '@lucid-agents/types/identity';
import { describe, expect,it } from 'bun:test';

import { createAgentCardWithSolanaIdentity } from '../manifest';

const makeCard = () => ({
  name: 'test-agent',
  version: '1.0.0',
  entrypoints: [],
  capabilities: {},
} as any);

describe('createAgentCardWithSolanaIdentity', () => {
  it('returns a new card object (immutable)', () => {
    const card = makeCard();
    const trust: TrustConfig = { trustModels: ['feedback'] };
    const result = createAgentCardWithSolanaIdentity(card, trust);
    expect(result).not.toBe(card);
  });

  it('adds trustModels to card', () => {
    const card = makeCard();
    const trust: TrustConfig = { trustModels: ['feedback', 'inference-validation'] };
    const result = createAgentCardWithSolanaIdentity(card, trust);
    expect(result.trustModels).toEqual(['feedback', 'inference-validation']);
  });

  it('deduplicates trustModels', () => {
    const card = makeCard();
    const trust: TrustConfig = { trustModels: ['feedback', 'feedback'] };
    const result = createAgentCardWithSolanaIdentity(card, trust);
    expect(result.trustModels?.length).toBe(1);
  });

  it('adds registrations to card', () => {
    const card = makeCard();
    const trust: TrustConfig = {
      registrations: [
        { agentId: '123', agentRegistry: 'solana:devnet:8004-solana' },
      ],
    };
    const result = createAgentCardWithSolanaIdentity(card, trust);
    expect(result.registrations?.length).toBe(1);
    expect(result.registrations?.[0].agentId).toBe('123');
  });

  it('adds FeedbackDataURI when provided', () => {
    const card = makeCard();
    const trust: TrustConfig = {
      feedbackDataUri: 'https://agent.example.com/feedback',
    };
    const result = createAgentCardWithSolanaIdentity(card, trust);
    expect(result.FeedbackDataURI).toBe('https://agent.example.com/feedback');
  });

  it('preserves existing card fields', () => {
    const card = { ...makeCard(), customField: 'preserved' } as any;
    const result = createAgentCardWithSolanaIdentity(card, {});
    expect((result as any).customField).toBe('preserved');
  });

  it('does not mutate the original card', () => {
    const card = makeCard();
    const trust: TrustConfig = { trustModels: ['feedback'] };
    createAgentCardWithSolanaIdentity(card, trust);
    expect(card.trustModels).toBeUndefined();
  });
});
