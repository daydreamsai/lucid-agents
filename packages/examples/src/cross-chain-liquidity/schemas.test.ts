import { describe, expect,it } from 'bun:test';

import { ChainIdSchema, DepthBucketSchema, ErrorEnvelopeSchema, LiquiditySnapshotInputSchema, LiquiditySnapshotOutputSchema, PoolInfoSchema, RouteInputSchema, RouteSchema,SlippageInputSchema, TokenAddressSchema, VenueSchema } from './schemas';

describe('Schema Validation', () => {
  describe('ChainIdSchema', () => {
    it('accepts valid CAIP-2 chain IDs', () => {
      expect(ChainIdSchema.safeParse('eip155:1').success).toBe(true);
      expect(ChainIdSchema.safeParse('eip155:137').success).toBe(true);
    });
    it('rejects invalid chain IDs', () => {
      expect(ChainIdSchema.safeParse('ethereum').success).toBe(false);
      expect(ChainIdSchema.safeParse('1').success).toBe(false);
    });
  });

  describe('TokenAddressSchema', () => {
    it('accepts valid EVM addresses', () => {
      expect(TokenAddressSchema.safeParse('0x0000000000000000000000000000000000000000').success).toBe(true);
    });
    it('rejects invalid addresses', () => {
      expect(TokenAddressSchema.safeParse('0x123').success).toBe(false);
    });
  });

  describe('VenueSchema', () => {
    it('accepts valid venues', () => { expect(VenueSchema.safeParse('uniswap_v3').success).toBe(true); });
    it('rejects invalid venues', () => { expect(VenueSchema.safeParse('unknown').success).toBe(false); });
  });

  describe('LiquiditySnapshotInputSchema', () => {
    const valid = { chain: 'eip155:1', baseToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' };
    it('accepts valid input', () => { expect(LiquiditySnapshotInputSchema.safeParse(valid).success).toBe(true); });
    it('accepts with venue filter', () => { expect(LiquiditySnapshotInputSchema.safeParse({ ...valid, venueFilter: ['uniswap_v3'] }).success).toBe(true); });
    it('rejects missing fields', () => { expect(LiquiditySnapshotInputSchema.safeParse({}).success).toBe(false); });
  });

  describe('LiquiditySnapshotOutputSchema', () => {
    it('validates complete output', () => {
      const out = { chain: 'eip155:1', baseToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', pools: [], freshnessMs: 100, confidenceScore: 0.9, timestamp: Date.now() };
      expect(LiquiditySnapshotOutputSchema.safeParse(out).success).toBe(true);
    });
    it('rejects invalid confidence', () => {
      const out = { chain: 'eip155:1', baseToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', pools: [], freshnessMs: 100, confidenceScore: 1.5, timestamp: Date.now() };
      expect(LiquiditySnapshotOutputSchema.safeParse(out).success).toBe(false);
    });
  });

  describe('SlippageInputSchema', () => {
    const valid = { chain: 'eip155:1', baseToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', notionalUsd: 50000 };
    it('accepts valid input', () => { expect(SlippageInputSchema.safeParse(valid).success).toBe(true); });
    it('rejects negative notional', () => { expect(SlippageInputSchema.safeParse({ ...valid, notionalUsd: -1 }).success).toBe(false); });
  });

  describe('RouteInputSchema', () => {
    const valid = { chain: 'eip155:1', baseToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', quoteToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', notionalUsd: 100000 };
    it('accepts valid input', () => { expect(RouteInputSchema.safeParse(valid).success).toBe(true); });
    it('applies default maxHops', () => { expect(RouteInputSchema.parse(valid).maxHops).toBe(3); });
    it('rejects maxHops > 4', () => { expect(RouteInputSchema.safeParse({ ...valid, maxHops: 5 }).success).toBe(false); });
  });

  describe('RouteSchema', () => {
    it('rejects empty hops', () => {
      expect(RouteSchema.safeParse({ hops: [], totalSlippageBps: 0, totalFeeBps: 0, estimatedOutput: 100, gasEstimate: 0, score: 100 }).success).toBe(false);
    });
  });

  describe('ErrorEnvelopeSchema', () => {
    it('accepts valid error', () => {
      expect(ErrorEnvelopeSchema.safeParse({ error: { code: 'invalid_input', message: 'Bad' }, timestamp: Date.now() }).success).toBe(true);
    });
    it('rejects unknown code', () => {
      expect(ErrorEnvelopeSchema.safeParse({ error: { code: 'unknown', message: 'Bad' }, timestamp: Date.now() }).success).toBe(false);
    });
  });

  describe('DepthBucketSchema', () => {
    it('accepts valid', () => { expect(DepthBucketSchema.safeParse({ notionalUsd: 10000, availableLiquidity: 9900, priceImpactBps: 10 }).success).toBe(true); });
    it('rejects negative', () => { expect(DepthBucketSchema.safeParse({ notionalUsd: -100, availableLiquidity: 100, priceImpactBps: 0 }).success).toBe(false); });
  });

  describe('PoolInfoSchema', () => {
    it('accepts valid', () => {
      expect(PoolInfoSchema.safeParse({ venue: 'uniswap_v3', poolAddress: '0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8', fee: 0.003, tvlUsd: 100000000, volume24hUsd: 50000000, depthBuckets: [] }).success).toBe(true);
    });
  });
});
