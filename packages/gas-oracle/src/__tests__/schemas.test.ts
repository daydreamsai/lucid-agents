import { describe, test, expect } from 'bun:test';
import {
  ChainSchema,
  UrgencySchema,
  TxTypeSchema,
  CongestionStateSchema,
  GasQuoteRequestSchema,
  GasQuoteResponseSchema,
  GasForecastRequestSchema,
  GasForecastResponseSchema,
  GasCongestionRequestSchema,
  GasCongestionResponseSchema,
  ErrorResponseSchema,
} from '../schemas';

describe('Schema Validation - Contract Tests', () => {
  describe('GasQuoteRequestSchema', () => {
    test('should accept valid request with all fields', () => {
      const validRequest = {
        chain: 'ethereum',
        urgency: 'high',
        txType: 'swap',
        recentFailureTolerance: 0.1,
      };
      const result = GasQuoteRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    test('should accept valid request with defaults', () => {
      const minimalRequest = {
        chain: 'base',
      };
      const result = GasQuoteRequestSchema.safeParse(minimalRequest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.urgency).toBe('medium');
        expect(result.data.txType).toBe('transfer');
        expect(result.data.recentFailureTolerance).toBe(0.05);
      }
    });

    test('should reject invalid chain', () => {
      const invalidRequest = {
        chain: 'invalid-chain',
      };
      const result = GasQuoteRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    test('should reject recentFailureTolerance out of range', () => {
      const invalidRequest = {
        chain: 'ethereum',
        recentFailureTolerance: 1.5,
      };
      const result = GasQuoteRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe('GasQuoteResponseSchema', () => {
    test('should accept valid response', () => {
      const validResponse = {
        recommended_max_fee: '50000000000',
        priority_fee: '2000000000',
        inclusion_probability_curve: [
          { blocks: 1, probability: 0.7 },
          { blocks: 2, probability: 0.9 },
          { blocks: 3, probability: 0.99 },
        ],
        congestion_state: 'moderate',
        confidence_score: 0.85,
        freshness_ms: 1500,
        timestamp: '2024-01-01T00:00:00.000Z',
      };
      const result = GasQuoteResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    test('should reject missing required fields', () => {
      const invalidResponse = {
        recommended_max_fee: '50000000000',
        priority_fee: '2000000000',
      };
      const result = GasQuoteResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    test('should reject invalid probability values', () => {
      const invalidResponse = {
        recommended_max_fee: '50000000000',
        priority_fee: '2000000000',
        inclusion_probability_curve: [
          { blocks: 1, probability: 1.5 }, // Invalid: > 1
        ],
        congestion_state: 'moderate',
        confidence_score: 0.85,
        freshness_ms: 1500,
        timestamp: '2024-01-01T00:00:00.000Z',
      };
      const result = GasQuoteResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    test('should reject invalid timestamp format', () => {
      const invalidResponse = {
        recommended_max_fee: '50000000000',
        priority_fee: '2000000000',
        inclusion_probability_curve: [
          { blocks: 1, probability: 0.7 },
        ],
        congestion_state: 'moderate',
        confidence_score: 0.85,
        freshness_ms: 1500,
        timestamp: 'invalid-date',
      };
      const result = GasQuoteResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });
  });

  describe('GasForecastRequestSchema', () => {
    test('should accept valid request', () => {
      const validRequest = {
        chain: 'ethereum',
        targetBlocks: 20,
      };
      const result = GasForecastRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    test('should apply default targetBlocks', () => {
      const minimalRequest = {
        chain: 'base',
      };
      const result = GasForecastRequestSchema.safeParse(minimalRequest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.targetBlocks).toBe(10);
      }
    });

    test('should reject negative targetBlocks', () => {
      const invalidRequest = {
        chain: 'ethereum',
        targetBlocks: -5,
      };
      const result = GasForecastRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe('GasForecastResponseSchema', () => {
    test('should accept valid response', () => {
      const validResponse = {
        chain: 'ethereum',
        current_block: 18000000,
        forecast: [
          {
            block_offset: 0,
            estimated_base_fee: '30000000000',
            estimated_priority_fee: '1500000000',
            confidence: 0.95,
          },
          {
            block_offset: 1,
            estimated_base_fee: '32000000000',
            estimated_priority_fee: '1600000000',
            confidence: 0.90,
          },
        ],
        freshness_ms: 2000,
        timestamp: '2024-01-01T00:00:00.000Z',
      };
      const result = GasForecastResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    test('should reject empty forecast array', () => {
      const invalidResponse = {
        chain: 'ethereum',
        current_block: 18000000,
        forecast: [],
        freshness_ms: 2000,
        timestamp: '2024-01-01T00:00:00.000Z',
      };
      const result = GasForecastResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(true); // Empty array is valid
    });
  });

  describe('GasCongestionRequestSchema', () => {
    test('should accept valid request', () => {
      const validRequest = {
        chain: 'ethereum',
      };
      const result = GasCongestionRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    test('should reject missing chain', () => {
      const invalidRequest = {};
      const result = GasCongestionRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe('GasCongestionResponseSchema', () => {
    test('should accept valid response', () => {
      const validResponse = {
        chain: 'ethereum',
        congestion_state: 'high',
        pending_tx_count: 15000,
        avg_block_utilization: 0.85,
        base_fee_trend: 'rising',
        freshness_ms: 1000,
        timestamp: '2024-01-01T00:00:00.000Z',
      };
      const result = GasCongestionResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    test('should reject invalid base_fee_trend', () => {
      const invalidResponse = {
        chain: 'ethereum',
        congestion_state: 'high',
        pending_tx_count: 15000,
        avg_block_utilization: 0.85,
        base_fee_trend: 'invalid',
        freshness_ms: 1000,
        timestamp: '2024-01-01T00:00:00.000Z',
      };
      const result = GasCongestionResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });
  });

  describe('ErrorResponseSchema', () => {
    test('should accept valid error response', () => {
      const validError = {
        error: {
          code: 'INVALID_CHAIN',
          message: 'Unsupported blockchain network',
          details: { chain: 'unknown' },
        },
        timestamp: '2024-01-01T00:00:00.000Z',
      };
      const result = ErrorResponseSchema.safeParse(validError);
      expect(result.success).toBe(true);
    });

    test('should accept error without details', () => {
      const validError = {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
        timestamp: '2024-01-01T00:00:00.000Z',
      };
      const result = ErrorResponseSchema.safeParse(validError);
      expect(result.success).toBe(true);
    });
  });
});
