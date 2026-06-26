import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import {
  ReputationRequestSchema,
  ReputationResponseSchema,
  HistoryRequestSchema,
  HistoryResponseSchema,
  TrustBreakdownRequestSchema,
  TrustBreakdownResponseSchema,
  ErrorResponseSchema,
} from '../schemas';

describe('API Contract Tests - Request/Response Schemas', () => {
  describe('ReputationRequestSchema', () => {
    it('validates valid reputation request', () => {
      const valid = {
        agentAddress: '0x1234567890123456789012345678901234567890',
        chain: 'eip155:84532',
      };
      expect(() => ReputationRequestSchema.parse(valid)).not.toThrow();
    });

    it('rejects invalid agent address', () => {
      const invalid = {
        agentAddress: 'not-an-address',
        chain: 'eip155:84532',
      };
      expect(() => ReputationRequestSchema.parse(invalid)).toThrow();
    });

    it('accepts optional timeframe', () => {
      const valid = {
        agentAddress: '0x1234567890123456789012345678901234567890',
        chain: 'eip155:84532',
        timeframe: '30d',
      };
      expect(() => ReputationRequestSchema.parse(valid)).not.toThrow();
    });
  });

  describe('ReputationResponseSchema', () => {
    it('validates complete reputation response', () => {
      const valid = {
        trust_score: 85.5,
        completion_rate: 0.95,
        dispute_rate: 0.02,
        onchain_identity_state: {
          agentId: '42',
          owner: '0x1234567890123456789012345678901234567890',
          registered: true,
        },
        evidence_urls: ['https://example.com/evidence/1'],
        freshness: {
          timestamp: new Date().toISOString(),
          age_seconds: 120,
        },
        confidence: 0.9,
      };
      expect(() => ReputationResponseSchema.parse(valid)).not.toThrow();
    });

    it('requires all mandatory fields', () => {
      const invalid = {
        trust_score: 85.5,
        // missing other required fields
      };
      expect(() => ReputationResponseSchema.parse(invalid)).toThrow();
    });

    it('validates trust_score range', () => {
      const invalid = {
        trust_score: 150, // out of range
        completion_rate: 0.95,
        dispute_rate: 0.02,
        onchain_identity_state: {
          agentId: '42',
          owner: '0x1234567890123456789012345678901234567890',
          registered: true,
        },
        evidence_urls: [],
        freshness: {
          timestamp: new Date().toISOString(),
          age_seconds: 120,
        },
        confidence: 0.9,
      };
      expect(() => ReputationResponseSchema.parse(invalid)).toThrow();
    });
  });

  describe('HistoryRequestSchema', () => {
    it('validates valid history request', () => {
      const valid = {
        agentAddress: '0x1234567890123456789012345678901234567890',
        chain: 'eip155:84532',
        limit: 50,
      };
      expect(() => HistoryRequestSchema.parse(valid)).not.toThrow();
    });

    it('accepts optional evidenceDepth', () => {
      const valid = {
        agentAddress: '0x1234567890123456789012345678901234567890',
        chain: 'eip155:84532',
        evidenceDepth: 'full',
      };
      expect(() => HistoryRequestSchema.parse(valid)).not.toThrow();
    });
  });

  describe('HistoryResponseSchema', () => {
    it('validates complete history response', () => {
      const valid = {
        events: [
          {
            type: 'feedback',
            timestamp: new Date().toISOString(),
            from: '0x1234567890123456789012345678901234567890',
            value: 90,
            evidence_url: 'https://example.com/evidence/1',
          },
        ],
        total_count: 1,
        freshness: {
          timestamp: new Date().toISOString(),
          age_seconds: 60,
        },
      };
      expect(() => HistoryResponseSchema.parse(valid)).not.toThrow();
    });
  });

  describe('TrustBreakdownRequestSchema', () => {
    it('validates valid trust breakdown request', () => {
      const valid = {
        agentAddress: '0x1234567890123456789012345678901234567890',
        chain: 'eip155:84532',
      };
      expect(() => TrustBreakdownRequestSchema.parse(valid)).not.toThrow();
    });
  });

  describe('TrustBreakdownResponseSchema', () => {
    it('validates complete trust breakdown response', () => {
      const valid = {
        components: {
          onchain_reputation: 80,
          completion_history: 90,
          dispute_resolution: 85,
          peer_endorsements: 75,
        },
        weights: {
          onchain_reputation: 0.4,
          completion_history: 0.3,
          dispute_resolution: 0.2,
          peer_endorsements: 0.1,
        },
        overall_score: 82.5,
        freshness: {
          timestamp: new Date().toISOString(),
          age_seconds: 30,
        },
        confidence: 0.95,
      };
      expect(() => TrustBreakdownResponseSchema.parse(valid)).not.toThrow();
    });
  });

  describe('ErrorResponseSchema', () => {
    it('validates error response with code and message', () => {
      const valid = {
        error: {
          code: 'INVALID_ADDRESS',
          message: 'Agent address is invalid',
        },
      };
      expect(() => ErrorResponseSchema.parse(valid)).not.toThrow();
    });

    it('accepts optional details field', () => {
      const valid = {
        error: {
          code: 'CHAIN_MISMATCH',
          message: 'Chain not supported',
          details: { supported_chains: ['eip155:84532'] },
        },
      };
      expect(() => ErrorResponseSchema.parse(valid)).not.toThrow();
    });
  });
});
