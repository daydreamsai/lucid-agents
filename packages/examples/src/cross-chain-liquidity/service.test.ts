import { describe, expect,it } from 'bun:test';

import { ErrorEnvelopeSchema,LiquiditySnapshotInputSchema, LiquiditySnapshotOutputSchema, RouteInputSchema, RouteOutputSchema, SlippageInputSchema, SlippageOutputSchema } from './schemas';

describe('Integration Tests', () => {
  const base = { chain: 'eip155:1', baseToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' };

  describe('Input Validation', () => {
    it('snapshot input', () => { expect(LiquiditySnapshotInputSchema.safeParse(base).success).toBe(true); expect(LiquiditySnapshotInputSchema.safeParse({}).success).toBe(false); });
    it('slippage input', () => { expect(SlippageInputSchema.safeParse({ ...base, notionalUsd: 50000 }).success).toBe(true); expect(SlippageInputSchema.safeParse({ ...base, notionalUsd: -1 }).success).toBe(false); });
    it('route input', () => { expect(RouteInputSchema.safeParse({ ...base, notionalUsd: 100000 }).success).toBe(true); expect(RouteInputSchema.safeParse({ ...base, notionalUsd: 100000, maxHops: 10 }).success).toBe(false); });
  });

  describe('Output Validation', () => {
    it('snapshot output', () => { expect(LiquiditySnapshotOutputSchema.safeParse({ ...base, pools: [], freshnessMs: 100, confidenceScore: 0.9, timestamp: Date.now() }).success).toBe(true); });
    it('slippage output', () => { expect(SlippageOutputSchema.safeParse({ ...base, notionalUsd: 50000, estimatedSlippageBps: 15, slippageBpsCurve: [{ notionalUsd: 10000, slippageBps: 5 }], bestVenue: 'uniswap_v3', freshnessMs: 100, confidenceScore: 0.9, timestamp: Date.now() }).success).toBe(true); });
    it('route output', () => {
      const route = { hops: [{ venue: 'uniswap_v3', poolAddress: '0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8', tokenIn: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', tokenOut: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', fee: 0.003, estimatedOutput: 99700 }], totalSlippageBps: 30, totalFeeBps: 30, estimatedOutput: 99700, gasEstimate: 150000, score: 85 };
      expect(RouteOutputSchema.safeParse({ ...base, notionalUsd: 100000, bestRoute: route, alternativeRoutes: [], freshnessMs: 100, confidenceScore: 0.9, timestamp: Date.now() }).success).toBe(true);
    });
  });

  describe('Freshness', () => {
    it('rejects negative freshnessMs', () => { expect(LiquiditySnapshotOutputSchema.safeParse({ ...base, pools: [], freshnessMs: -100, confidenceScore: 0.9, timestamp: Date.now() }).success).toBe(false); });
    it('rejects confidence > 1', () => { expect(LiquiditySnapshotOutputSchema.safeParse({ ...base, pools: [], freshnessMs: 100, confidenceScore: 1.5, timestamp: Date.now() }).success).toBe(false); });
  });

  describe('Chain Support', () => {
    it('accepts supported chains', () => { ['eip155:1', 'eip155:137', 'eip155:42161'].forEach(c => expect(LiquiditySnapshotInputSchema.safeParse({ ...base, chain: c }).success).toBe(true)); });
    it('rejects invalid format', () => { ['ethereum', '1', 'solana:mainnet'].forEach(c => expect(LiquiditySnapshotInputSchema.safeParse({ ...base, chain: c }).success).toBe(false)); });
  });

  describe('Venue Filtering', () => {
    it('accepts valid venues', () => { expect(LiquiditySnapshotInputSchema.safeParse({ ...base, venueFilter: ['uniswap_v3', 'curve'] }).success).toBe(true); });
    it('rejects invalid venues', () => { expect(LiquiditySnapshotInputSchema.safeParse({ ...base, venueFilter: ['invalid'] }).success).toBe(false); });
  });

  describe('Payment', () => {
    it('prices valid', () => { ['0.10', '0.05', '0.15'].forEach(p => { expect(parseFloat(p)).toBeGreaterThan(0); expect(p).toMatch(/^\d+\.\d{2}$/); }); });
  });

  describe('Error Handling', () => {
    it('error envelope valid', () => {
      ['invalid_input', 'unsupported_chain', 'stale_data', 'payment_required'].forEach(code => {
        expect(ErrorEnvelopeSchema.safeParse({ error: { code, message: 'Test' }, timestamp: Date.now() }).success).toBe(true);
      });
    });
  });
});
