import { describe, expect, it } from 'bun:test';

import {
  ChainSchema,
  ConfidenceAnnotationSchema,
  ErrorResponseSchema,
  EvidenceDepthSchema,
  FreshnessMetadataSchema,
  HistoryRequestSchema,
  HistoryResponseSchema,
  OnchainIdentityStateSchema,
  ReputationRequestSchema,
  ReputationResponseSchema,
  TimeframeSchema,
  TrustBreakdownRequestSchema,
  TrustBreakdownResponseSchema,
} from '../schemas';

describe('Request Schemas', () => {
  describe('ReputationRequestSchema', () => {
    it('validates valid request with all fields', () => {
      const input = {
        agentAddress: '0x1234567890123456789012345678901234567890',
        chain: 'base',
        timeframe: '30d',
        evidenceDepth: 'standard',
      };
      const result = ReputationRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agentAddress).toBe(input.agentAddress);
        expect(result.data.chain).toBe('base');
      }
    });

    it('applies defaults for optional fields', () => {
      const input = {
        agentAddress: '0x1234567890123456789012345678901234567890',
      };
      const result = ReputationRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.chain).toBe('base');
        expect(result.data.timeframe).toBe('30d');
        expect(result.data.evidenceDepth).toBe('standard');
      }
    });

    it('rejects invalid Ethereum address', () => {
      const input = {
        agentAddress: 'invalid-address',
        chain: 'base',
      };
      const result = ReputationRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects address with wrong length', () => {
      const input = {
        agentAddress: '0x123456789012345678901234567890123456789',
        chain: 'base',
      };
      const result = ReputationRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects invalid chain', () => {
      const input = {
        agentAddress: '0x1234567890123456789012345678901234567890',
        chain: 'invalid-chain',
      };
      const result = ReputationRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('HistoryRequestSchema', () => {
    it('validates valid request', () => {
      const input = {
        agentAddress: '0x1234567890123456789012345678901234567890',
        chain: 'ethereum',
        limit: 50,
        offset: 10,
      };
      const result = HistoryRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('applies defaults', () => {
      const input = {
        agentAddress: '0x1234567890123456789012345678901234567890',
      };
      const result = HistoryRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20);
        expect(result.data.offset).toBe(0);
      }
    });

    it('rejects limit over 100', () => {
      const input = {
        agentAddress: '0x1234567890123456789012345678901234567890',
        limit: 101,
      };
      const result = HistoryRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects negative offset', () => {
      const input = {
        agentAddress: '0x1234567890123456789012345678901234567890',
        offset: -1,
      };
      const result = HistoryRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('TrustBreakdownRequestSchema', () => {
    it('validates valid request', () => {
      const input = {
        agentAddress: '0x1234567890123456789012345678901234567890',
        chain: 'optimism',
        timeframe: '7d',
      };
      const result = TrustBreakdownRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('ChainSchema', () => {
    it('accepts all valid chains', () => {
      const chains = ['ethereum', 'base', 'optimism', 'arbitrum', 'polygon'];
      for (const chain of chains) {
        expect(ChainSchema.safeParse(chain).success).toBe(true);
      }
    });
  });

  describe('TimeframeSchema', () => {
    it('accepts all valid timeframes', () => {
      const timeframes = ['24h', '7d', '30d', '90d', '1y', 'all'];
      for (const tf of timeframes) {
        expect(TimeframeSchema.safeParse(tf).success).toBe(true);
      }
    });
  });

  describe('EvidenceDepthSchema', () => {
    it('accepts all valid depths', () => {
      const depths = ['minimal', 'standard', 'full'];
      for (const depth of depths) {
        expect(EvidenceDepthSchema.safeParse(depth).success).toBe(true);
      }
    });
  });
});

describe('Response Schemas', () => {
  describe('FreshnessMetadataSchema', () => {
    it('validates valid freshness metadata', () => {
      const input = {
        lastUpdated: '2024-01-15T10:30:00Z',
        dataAge: 300,
        nextRefresh: '2024-01-15T10:35:00Z',
        source: 'onchain',
      };
      const result = FreshnessMetadataSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('allows optional nextRefresh', () => {
      const input = {
        lastUpdated: '2024-01-15T10:30:00Z',
        dataAge: 300,
        source: 'cache',
      };
      const result = FreshnessMetadataSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects negative dataAge', () => {
      const input = {
        lastUpdated: '2024-01-15T10:30:00Z',
        dataAge: -1,
        source: 'onchain',
      };
      const result = FreshnessMetadataSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('ConfidenceAnnotationSchema', () => {
    it('validates valid confidence annotation', () => {
      const input = {
        level: 'high',
        score: 0.95,
        factors: ['verified_identity', 'long_history', 'no_disputes'],
      };
      const result = ConfidenceAnnotationSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects score above 1', () => {
      const input = {
        level: 'high',
        score: 1.5,
        factors: [],
      };
      const result = ConfidenceAnnotationSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects score below 0', () => {
      const input = {
        level: 'low',
        score: -0.1,
        factors: [],
      };
      const result = ConfidenceAnnotationSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('OnchainIdentityStateSchema', () => {
    it('validates registered agent', () => {
      const input = {
        registered: true,
        agentId: '12345',
        registryAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
        domain: 'agent.example.com',
        owner: '0x1234567890123456789012345678901234567890',
        active: true,
        trustModels: ['feedback', 'tee-attestation'],
      };
      const result = OnchainIdentityStateSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('validates unregistered agent', () => {
      const input = {
        registered: false,
        active: false,
        trustModels: [],
      };
      const result = OnchainIdentityStateSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('ReputationResponseSchema', () => {
    it('validates complete reputation response', () => {
      const input = {
        agentAddress: '0x1234567890123456789012345678901234567890',
        chain: 'base',
        trustScore: 85.5,
        completionRate: 98.2,
        disputeRate: 1.5,
        onchainIdentityState: {
          registered: true,
          agentId: '123',
          active: true,
          trustModels: ['feedback'],
        },
        evidenceUrls: [
          {
            type: 'transaction',
            url: 'https://basescan.org/tx/0x123',
            timestamp: '2024-01-15T10:00:00Z',
          },
        ],
        freshness: {
          lastUpdated: '2024-01-15T10:30:00Z',
          dataAge: 300,
          source: 'aggregated',
        },
        confidence: {
          level: 'high',
          score: 0.9,
          factors: ['verified'],
        },
      };
      const result = ReputationResponseSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects trustScore above 100', () => {
      const input = {
        agentAddress: '0x1234567890123456789012345678901234567890',
        chain: 'base',
        trustScore: 101,
        completionRate: 98.2,
        disputeRate: 1.5,
        onchainIdentityState: {
          registered: false,
          active: false,
          trustModels: [],
        },
        evidenceUrls: [],
        freshness: {
          lastUpdated: '2024-01-15T10:30:00Z',
          dataAge: 300,
          source: 'cache',
        },
        confidence: {
          level: 'medium',
          score: 0.5,
          factors: [],
        },
      };
      const result = ReputationResponseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('HistoryResponseSchema', () => {
    it('validates history response with events', () => {
      const input = {
        agentAddress: '0x1234567890123456789012345678901234567890',
        chain: 'ethereum',
        events: [
          {
            id: 'evt_001',
            type: 'task_completed',
            timestamp: '2024-01-15T10:00:00Z',
            details: { taskId: 'task_123', reward: '0.1 ETH' },
            evidenceUrl: 'https://etherscan.io/tx/0x123',
          },
          {
            id: 'evt_002',
            type: 'feedback_received',
            timestamp: '2024-01-15T09:00:00Z',
            details: { rating: 5, comment: 'Great work!' },
          },
        ],
        total: 150,
        limit: 20,
        offset: 0,
        freshness: {
          lastUpdated: '2024-01-15T10:30:00Z',
          dataAge: 60,
          source: 'onchain',
        },
        confidence: {
          level: 'high',
          score: 0.9,
          factors: ['verified_identity', 'abundant_evidence'],
        },
      };
      const result = HistoryResponseSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('TrustBreakdownResponseSchema', () => {
    it('validates trust breakdown response', () => {
      const input = {
        agentAddress: '0x1234567890123456789012345678901234567890',
        chain: 'base',
        overallScore: 87.5,
        components: [
          {
            name: 'Task Completion',
            score: 95,
            weight: 0.4,
            description: 'Historical task completion rate',
            evidenceCount: 150,
          },
          {
            name: 'Dispute Resolution',
            score: 80,
            weight: 0.3,
            description: 'Dispute handling and resolution',
            evidenceCount: 5,
          },
          {
            name: 'Peer Feedback',
            score: 85,
            weight: 0.3,
            description: 'Ratings from other agents',
            evidenceCount: 45,
          },
        ],
        freshness: {
          lastUpdated: '2024-01-15T10:30:00Z',
          dataAge: 120,
          source: 'aggregated',
        },
        confidence: {
          level: 'high',
          score: 0.88,
          factors: ['sufficient_data', 'recent_activity'],
        },
      };
      const result = TrustBreakdownResponseSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });
});

describe('Error Schema', () => {
  const validFreshness = {
    lastUpdated: '2024-01-15T10:30:00Z',
    dataAge: 0,
    source: 'cache',
  };
  const validConfidence = {
    level: 'low',
    score: 0,
    factors: ['error_response'],
  };

  describe('ErrorResponseSchema', () => {
    it('validates error response with details', () => {
      const input = {
        error: {
          code: 'INVALID_ADDRESS',
          message: 'The provided address is not a valid Ethereum address',
          details: { provided: 'invalid', expected: '0x...' },
        },
        freshness: validFreshness,
        confidence: validConfidence,
      };
      const result = ErrorResponseSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('validates error response without details', () => {
      const input = {
        error: {
          code: 'AGENT_NOT_FOUND',
          message: 'No agent found with the specified address',
        },
        freshness: validFreshness,
        confidence: validConfidence,
      };
      const result = ErrorResponseSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('validates payment required error', () => {
      const input = {
        error: {
          code: 'PAYMENT_REQUIRED',
          message: 'Payment required to access this endpoint',
          details: { price: '0.001 ETH', payTo: '0x...' },
        },
        freshness: validFreshness,
        confidence: validConfidence,
      };
      const result = ErrorResponseSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects unknown error code', () => {
      const input = {
        error: {
          code: 'UNKNOWN_ERROR',
          message: 'Something went wrong',
        },
        freshness: validFreshness,
        confidence: validConfidence,
      };
      const result = ErrorResponseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});
