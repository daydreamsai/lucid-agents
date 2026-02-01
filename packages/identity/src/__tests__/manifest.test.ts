import type { AgentCardWithEntrypoints } from '@lucid-agents/types/a2a';
import type { TrustConfig } from '@lucid-agents/types/identity';
import { describe, expect, it } from 'bun:test';

import { createAgentCardWithIdentity } from '../manifest';

describe('createAgentCardWithIdentity', () => {
  const baseCard: AgentCardWithEntrypoints = {
    name: 'test-agent',
    version: '1.0.0',
    url: 'https://agent.example.com/',
    entrypoints: {},
    skills: [],
  };

  const trustConfig: TrustConfig = {
    registrations: [
      {
        agentId: 'agent-123',
        agentAddress: 'eip155:8453:0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429',
        agentRegistry: 'eip155:8453:0x000000000000000000000000000000000000dead',
      },
    ],
    trustModels: ['feedback', 'inference-validation'],
    validationRequestsUri: 'https://validation.example.com/requests',
    validationResponsesUri: 'https://validation.example.com/responses',
    feedbackDataUri: 'https://feedback.example.com/data',
  };

  it('creates new card with identity metadata', () => {
    const enhanced = createAgentCardWithIdentity(baseCard, trustConfig);

    expect(enhanced).not.toBe(baseCard);
    expect(enhanced.registrations).toBeDefined();
    expect(Array.isArray(enhanced.registrations)).toBe(true);
    expect(enhanced.trustModels).toBeDefined();
    expect(Array.isArray(enhanced.trustModels)).toBe(true);
  });

  it('is immutable - original card unchanged', () => {
    const original = { ...baseCard };
    createAgentCardWithIdentity(baseCard, trustConfig);

    expect(baseCard.registrations).toBeUndefined();
    expect(baseCard.trustModels).toBeUndefined();
  });

  it('adds registrations array', () => {
    const enhanced = createAgentCardWithIdentity(baseCard, trustConfig);

    expect(enhanced.registrations).toEqual(trustConfig.registrations);
  });

  it('adds trustModels array', () => {
    const enhanced = createAgentCardWithIdentity(baseCard, trustConfig);

    expect(enhanced.trustModels).toEqual(['feedback', 'inference-validation']);
  });

  it('adds validation URIs', () => {
    const enhanced = createAgentCardWithIdentity(baseCard, trustConfig);

    expect(enhanced.ValidationRequestsURI).toBe(
      trustConfig.validationRequestsUri
    );
    expect(enhanced.ValidationResponsesURI).toBe(
      trustConfig.validationResponsesUri
    );
    expect(enhanced.FeedbackDataURI).toBe(trustConfig.feedbackDataUri);
  });

  it('handles missing optional fields', () => {
    const minimalTrust: TrustConfig = {
      registrations: [],
      trustModels: [],
    };

    const enhanced = createAgentCardWithIdentity(baseCard, minimalTrust);

    expect(enhanced.registrations).toEqual([]);
    expect(enhanced.trustModels).toEqual([]);
    expect(enhanced.ValidationRequestsURI).toBeUndefined();
  });

  it('deduplicates trustModels', () => {
    const trustWithDuplicates: TrustConfig = {
      registrations: [],
      trustModels: ['feedback', 'feedback', 'inference-validation'],
    };

    const enhanced = createAgentCardWithIdentity(baseCard, trustWithDuplicates);

    expect(enhanced.trustModels).toEqual(['feedback', 'inference-validation']);
  });
});
