import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import {
  LiquiditySnapshotRequestSchema,
  LiquiditySnapshotResponseSchema,
  SlippageRequestSchema,
  SlippageResponseSchema,
  RoutesRequestSchema,
  RoutesResponseSchema,
} from '../schemas';

describe('API Schemas', () => {
  describe('LiquiditySnapshotRequestSchema', () => {
    test('should validate valid request', () => {
      const valid = {
        chain: 'ethereum',
        baseToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      };
      expect(() => LiquiditySnapshotRequestSchema.parse(valid)).not.toThrow();
    });

    test('should reject invalid chain', () => {
      const invalid = {
        chain: 'invalid-chain',
        baseToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      };
      expect(() => LiquiditySnapshotRequestSchema.parse(invalid)).toThrow();
    });

    test('should reject invalid token address', () => {
      const invalid = {
        chain: 'ethereum',
        baseToken: 'not-an-address',
        quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      };
      expect(() => LiquiditySnapshotRequestSchema.parse(invalid)).toThrow();
    });

    test('should accept optional venueFilter', () => {
      const valid = {
        chain: 'ethereum',
        baseToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        venueFilter: ['uniswap-v3', 'curve'],
      };
      expect(() => LiquiditySnapshotRequestSchema.parse(valid)).not.toThrow();
    });
  });

  describe('LiquiditySnapshotResponseSchema', () => {
    test('should validate valid response', () => {
      const valid = {
        pools: [
          {
            venue: 'uniswap-v3',
            address: '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640',
            baseToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            tvlUsd: 150000000,
            depthBuckets: [
              { notionalUsd: 1000, liquidityUsd: 50000 },
              { notionalUsd: 10000, liquidityUsd: 500000 },
            ],
          },
        ],
        freshness_ms: 5000,
        timestamp: new Date().toISOString(),
      };
      expect(() => LiquiditySnapshotResponseSchema.parse(valid)).not.toThrow();
    });

    test('should reject missing required fields', () => {
      const invalid = {
        pools: [],
        freshness_ms: 5000,
      };
      expect(() => LiquiditySnapshotResponseSchema.parse(invalid)).toThrow();
    });
  });

  describe('SlippageRequestSchema', () => {
    test('should validate valid request', () => {
      const valid = {
        chain: 'ethereum',
        baseToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        notionalUsd: 10000,
      };
      expect(() => SlippageRequestSchema.parse(valid)).not.toThrow();
    });

    test('should reject negative notionalUsd', () => {
      const invalid = {
        chain: 'ethereum',
        baseToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        notionalUsd: -1000,
      };
      expect(() => SlippageRequestSchema.parse(invalid)).toThrow();
    });
  });

  describe('SlippageResponseSchema', () => {
    test('should validate valid response', () => {
      const valid = {
        slippage_bps_curve: [
          { notionalUsd: 1000, slippageBps: 5 },
          { notionalUsd: 10000, slippageBps: 25 },
          { notionalUsd: 100000, slippageBps: 150 },
        ],
        confidence_score: 0.95,
        freshness_ms: 3000,
        timestamp: new Date().toISOString(),
      };
      expect(() => SlippageResponseSchema.parse(valid)).not.toThrow();
    });

    test('should reject invalid confidence_score', () => {
      const invalid = {
        slippage_bps_curve: [{ notionalUsd: 1000, slippageBps: 5 }],
        confidence_score: 1.5,
        freshness_ms: 3000,
        timestamp: new Date().toISOString(),
      };
      expect(() => SlippageResponseSchema.parse(invalid)).toThrow();
    });
  });

  describe('RoutesRequestSchema', () => {
    test('should validate valid request', () => {
      const valid = {
        chain: 'ethereum',
        baseToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        notionalUsd: 50000,
      };
      expect(() => RoutesRequestSchema.parse(valid)).not.toThrow();
    });
  });

  describe('RoutesResponseSchema', () => {
    test('should validate valid response', () => {
      const valid = {
        best_route: {
          path: ['uniswap-v3', 'curve'],
          estimatedSlippageBps: 45,
          estimatedGasUsd: 15,
          totalCostBps: 60,
          confidence_score: 0.92,
        },
        alternatives: [
          {
            path: ['sushiswap'],
            estimatedSlippageBps: 80,
            estimatedGasUsd: 12,
            totalCostBps: 92,
            confidence_score: 0.88,
          },
        ],
        freshness_ms: 4000,
        timestamp: new Date().toISOString(),
      };
      expect(() => RoutesResponseSchema.parse(valid)).not.toThrow();
    });

    test('should accept empty alternatives', () => {
      const valid = {
        best_route: {
          path: ['uniswap-v3'],
          estimatedSlippageBps: 30,
          estimatedGasUsd: 10,
          totalCostBps: 40,
          confidence_score: 0.95,
        },
        alternatives: [],
        freshness_ms: 2000,
        timestamp: new Date().toISOString(),
      };
      expect(() => RoutesResponseSchema.parse(valid)).not.toThrow();
    });
  });
});
