import { describe, expect, it } from 'bun:test';
import type { AgentCardWithEntrypoints } from '@lucid-agents/types/a2a';
import type { TrustConfig } from '@lucid-agents/types/identity';
import { createAgentCardWithSolanaIdentity } from '../extension.js';

describe('createAgentCardWithSolanaIdentity', () => {
  const baseCard: AgentCardWithEntrypoints = {
    name: 'solana-agent',
    version: '1.0.0',
    url: 'https://my-agent.example.com/',
    entrypoints: {},
    skills: [],
  };

  const trustConfig: TrustConfig = {
    registrations: [
      {
        agentId: '1',
        agentAddress:
          'solana:devnet:9yPGxVrYi7C5JLMGjEZhK8qQ4tn7SzMWwQHvz3vGJCKz',
        agentRegistry:
          'solana:devnet:AgentId11111111111111111111111111111111111111',
      },
    ],
    trustModels: ['feedback', 'inference-validation'],
    validationRequestsUri: 'https://validation.example.com/requests',
    validationResponsesUri: 'https://validation.example.com/responses',
    feedbackDataUri: 'https://feedback.example.com/data',
  };

  it('creates new card with Solana identity metadata', () => {
    const enhanced = createAgentCardWithSolanaIdentity(baseCard, trustConfig);
    expect(enhanced).not.toBe(baseCard);
    expect(enhanced.registrations).toBeDefined();
    expect(enhanced.trustModels).toBeDefined();
  });

  it('does not mutate original card', () => {
    const original = { ...baseCard };
    createAgentCardWithSolanaIdentity(baseCard, trustConfig);
    expect(baseCard.registrations).toBeUndefined();
    expect(baseCard.trustModels).toBeUndefined();
  });

  it('adds registrations with Solana CAIP-10 format', () => {
    const enhanced = createAgentCardWithSolanaIdentity(baseCard, trustConfig);
    expect(enhanced.registrations![0].agentRegistry).toContain('solana:');
  });

  it('adds trust models', () => {
    const enhanced = createAgentCardWithSolanaIdentity(baseCard, trustConfig);
    expect(enhanced.trustModels).toEqual(['feedback', 'inference-validation']);
  });

  it('deduplicates trust models', () => {
    const trust: TrustConfig = {
      trustModels: ['feedback', 'feedback', 'inference-validation'],
    };
    const enhanced = createAgentCardWithSolanaIdentity(baseCard, trust);
    expect(enhanced.trustModels).toEqual(['feedback', 'inference-validation']);
  });

  it('adds validation URIs', () => {
    const enhanced = createAgentCardWithSolanaIdentity(baseCard, trustConfig);
    expect(enhanced.ValidationRequestsURI).toBe(
      trustConfig.validationRequestsUri
    );
    expect(enhanced.ValidationResponsesURI).toBe(
      trustConfig.validationResponsesUri
    );
    expect(enhanced.FeedbackDataURI).toBe(trustConfig.feedbackDataUri);
  });

  it('handles missing optional fields gracefully', () => {
    const minimalTrust: TrustConfig = {};
    const enhanced = createAgentCardWithSolanaIdentity(baseCard, minimalTrust);
    expect(enhanced.registrations).toBeUndefined();
    expect(enhanced.trustModels).toBeUndefined();
  });
});
