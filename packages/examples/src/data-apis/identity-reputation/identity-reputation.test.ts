import { describe, it, expect } from 'vitest';
import { ReputationRequestSchema, ReputationResponseSchema, HistoryRequestSchema, HistoryResponseSchema, TrustBreakdownRequestSchema, TrustBreakdownResponseSchema } from './schema';
import { getReputation, getHistory, getTrustBreakdown, generateFreshness } from './logic';

const validAddress = '0x1234567890123456789012345678901234567890';
const validChain = 'eip155:1';

describe('Contract Tests', () => {
  describe('ReputationRequestSchema', () => {
    it('should accept valid request', () => {
      expect(ReputationRequestSchema.safeParse({ agentAddress: validAddress, chain: validChain }).success).toBe(true);
    });
    it('should reject invalid address', () => {
      expect(ReputationRequestSchema.safeParse({ agentAddress: 'invalid', chain: validChain }).success).toBe(false);
    });
    it('should reject invalid chain format', () => {
      expect(ReputationRequestSchema.safeParse({ agentAddress: validAddress, chain: 'ethereum' }).success).toBe(false);
    });
  });

  describe('Response Schemas', () => {
    it('should validate reputation response', () => {
      const response = getReputation({ agentAddress: validAddress, chain: validChain });
      expect(ReputationResponseSchema.safeParse(response).success).toBe(true);
    });
    it('should validate history response', () => {
      const response = getHistory({ agentAddress: validAddress, chain: validChain });
      expect(HistoryResponseSchema.safeParse(response).success).toBe(true);
    });
    it('should validate trust breakdown response', () => {
      const response = getTrustBreakdown({ agentAddress: validAddress, chain: validChain });
      expect(TrustBreakdownResponseSchema.safeParse(response).success).toBe(true);
    });
  });
});

describe('Business Logic Tests', () => {
  describe('getReputation', () => {
    it('should return trust score within range', () => {
      const result = getReputation({ agentAddress: validAddress, chain: validChain });
      expect(result.trust_score).toBeGreaterThanOrEqual(0);
      expect(result.trust_score).toBeLessThanOrEqual(100);
    });
    it('should return consistent results', () => {
      const r1 = getReputation({ agentAddress: validAddress, chain: validChain });
      const r2 = getReputation({ agentAddress: validAddress, chain: validChain });
      expect(r1.trust_score).toBe(r2.trust_score);
    });
    it('should return rates between 0 and 1', () => {
      const result = getReputation({ agentAddress: validAddress, chain: validChain });
      expect(result.completion_rate).toBeGreaterThanOrEqual(0);
      expect(result.completion_rate).toBeLessThanOrEqual(1);
      expect(result.dispute_rate).toBeGreaterThanOrEqual(0);
      expect(result.dispute_rate).toBeLessThanOrEqual(1);
    });
  });

  describe('getHistory', () => {
    it('should return events array', () => {
      const result = getHistory({ agentAddress: validAddress, chain: validChain });
      expect(Array.isArray(result.events)).toBe(true);
    });
    it('should have successful_tasks <= total_tasks', () => {
      const result = getHistory({ agentAddress: validAddress, chain: validChain });
      expect(result.successful_tasks).toBeLessThanOrEqual(result.total_tasks);
    });
  });

  describe('getTrustBreakdown', () => {
    it('should return 5 components', () => {
      const result = getTrustBreakdown({ agentAddress: validAddress, chain: validChain });
      expect(result.components.length).toBe(5);
    });
    it('should have weights sum to 1', () => {
      const result = getTrustBreakdown({ agentAddress: validAddress, chain: validChain });
      const total = result.components.reduce((sum, c) => sum + c.weight, 0);
      expect(total).toBeCloseTo(1, 2);
    });
    it('should include recommendations', () => {
      const result = getTrustBreakdown({ agentAddress: validAddress, chain: validChain });
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });
});

describe('Freshness Tests', () => {
  it('should mark as fresh when staleness is low', () => {
    expect(generateFreshness(0).sla_status).toBe('fresh');
  });
  it('should mark as stale when staleness exceeds threshold', () => {
    expect(generateFreshness(400000).sla_status).toBe('stale');
  });
  it('should mark as expired when staleness is very high', () => {
    expect(generateFreshness(4000000).sla_status).toBe('expired');
  });
});

describe('Integration Tests', () => {
  it('should handle different chains', () => {
    const r1 = getReputation({ agentAddress: validAddress, chain: 'eip155:1' });
    const r2 = getReputation({ agentAddress: validAddress, chain: 'eip155:137' });
    expect(r1.trust_score).not.toBe(r2.trust_score);
  });
});
