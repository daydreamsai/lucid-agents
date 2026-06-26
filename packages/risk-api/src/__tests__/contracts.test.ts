import { describe, expect, it } from 'bun:test';
import {
  RiskScoreRequestSchema,
  RiskScoreResponseSchema,
  ExposurePathsRequestSchema,
  ExposurePathsResponseSchema,
  EntityProfileRequestSchema,
  EntityProfileResponseSchema,
  ErrorResponseSchema,
} from '../schemas';

// Valid 40-char hex address (42 chars total with 0x prefix)
const VALID_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';
const VALID_ADDRESS_2 = '0x1234567890123456789012345678901234567890';

describe('Contract Tests - Request/Response Schemas', () => {
  describe('POST /v1/risk/score', () => {
    it('should validate valid risk score request', () => {
      const validRequest = {
        address: VALID_ADDRESS,
        network: 'eip155:1',
        transaction_context: {
          amount: '1000',
          currency: 'USDC',
        },
        threshold: 0.7,
        lookback_days: 30,
      };

      const result = RiskScoreRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject invalid address format', () => {
      const invalidRequest = {
        address: 'invalid-address',
        network: 'eip155:1',
      };

      const result = RiskScoreRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('should validate risk score response structure', () => {
      const validResponse = {
        risk_score: 0.65,
        risk_factors: [
          {
            factor: 'sanctions_proximity',
            weight: 0.4,
            evidence: ['Entity within 2 hops of sanctioned address'],
          },
        ],
        cluster_id: 'cluster_abc123',
        sanctions_proximity: 2,
        evidence_refs: ['ref_001', 'ref_002'],
        freshness: {
          data_timestamp: '2026-02-27T01:00:00Z',
          staleness_seconds: 120,
        },
        confidence: 0.85,
      };

      const result = RiskScoreResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('should enforce risk_score bounds [0, 1]', () => {
      const invalidResponse = {
        risk_score: 1.5,
        risk_factors: [],
        evidence_refs: [],
        freshness: {
          data_timestamp: '2026-02-27T01:00:00Z',
          staleness_seconds: 0,
        },
        confidence: 0.9,
      };

      const result = RiskScoreResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });
  });

  describe('GET /v1/risk/exposure-paths', () => {
    it('should validate exposure paths request', () => {
      const validRequest = {
        address: VALID_ADDRESS,
        network: 'eip155:1',
        max_depth: 3,
        min_confidence: 0.6,
      };

      const result = ExposurePathsRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should validate exposure paths response', () => {
      const validResponse = {
        paths: [
          {
            path: [VALID_ADDRESS, VALID_ADDRESS_2],
            risk_score: 0.8,
            confidence: 0.75,
            evidence: ['Direct transaction link'],
          },
        ],
        total_paths: 1,
        freshness: {
          data_timestamp: '2026-02-27T01:00:00Z',
          staleness_seconds: 60,
        },
      };

      const result = ExposurePathsResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });
  });

  describe('GET /v1/risk/entity-profile', () => {
    it('should validate entity profile request', () => {
      const validRequest = {
        address: VALID_ADDRESS,
        network: 'eip155:1',
      };

      const result = EntityProfileRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should validate entity profile response', () => {
      const validResponse = {
        address: VALID_ADDRESS,
        cluster_id: 'cluster_xyz789',
        labels: ['exchange', 'high-volume'],
        risk_indicators: {
          sanctions_proximity: 0,
          mixer_exposure: false,
          high_risk_counterparties: 2,
        },
        transaction_stats: {
          total_volume: '1000000',
          transaction_count: 150,
          first_seen: '2025-01-01T00:00:00Z',
          last_seen: '2026-02-26T23:00:00Z',
        },
        freshness: {
          data_timestamp: '2026-02-27T01:00:00Z',
          staleness_seconds: 90,
        },
        confidence: 0.92,
      };

      const result = EntityProfileResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });
  });

  describe('Error Response Contract', () => {
    it('should validate error response structure', () => {
      const validError = {
        error: {
          code: 'invalid_address',
          message: 'The provided address format is invalid',
          details: {
            field: 'address',
            provided: 'invalid-addr',
          },
        },
      };

      const result = ErrorResponseSchema.safeParse(validError);
      expect(result.success).toBe(true);
    });

    it('should require error code and message', () => {
      const invalidError = {
        error: {
          message: 'Something went wrong',
        },
      };

      const result = ErrorResponseSchema.safeParse(invalidError);
      expect(result.success).toBe(false);
    });
  });
});
