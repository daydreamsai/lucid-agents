import { describe, test, expect } from 'bun:test';
import { buildFreshness, computeConfidence } from '../../src/logic/freshness';

describe('buildFreshness', () => {
  test('3.1 markStale returns stale=true when block_age_ms > threshold', () => {
    const result = buildFreshness({
      fetched_at: new Date(),
      block_number: 19500000,
      block_timestamp_ms: Date.now() - 60_000, // 60s ago
      data_source: 'live',
      stale_threshold_ms: 30_000,
    });
    expect(result.stale).toBe(true);
  });

  test('3.2 markStale returns stale=false for fresh data', () => {
    const result = buildFreshness({
      fetched_at: new Date(),
      block_number: 19500000,
      block_timestamp_ms: Date.now() - 2_000, // 2s ago
      data_source: 'live',
      stale_threshold_ms: 30_000,
    });
    expect(result.stale).toBe(false);
  });
});

describe('computeConfidence', () => {
  test('3.3 returns lower score for high volatility', () => {
    const highVol = computeConfidence({
      sample_size: 20,
      base_fee_volatility: 0.5,
      block_age_ms: 2000,
      mempool_available: true,
    });
    const lowVol = computeConfidence({
      sample_size: 20,
      base_fee_volatility: 0.05,
      block_age_ms: 2000,
      mempool_available: true,
    });
    expect(highVol.score).toBeLessThan(lowVol.score);
  });

  test('3.4 returns higher score for large sample sizes', () => {
    const large = computeConfidence({
      sample_size: 20,
      base_fee_volatility: 0.1,
      block_age_ms: 2000,
      mempool_available: true,
    });
    const small = computeConfidence({
      sample_size: 5,
      base_fee_volatility: 0.1,
      block_age_ms: 2000,
      mempool_available: true,
    });
    expect(large.score).toBeGreaterThan(small.score);
  });

  test('3.5 factors array lists contributing factors', () => {
    const result = computeConfidence({
      sample_size: 20,
      base_fee_volatility: 0.05,
      block_age_ms: 2000,
      mempool_available: true,
    });
    expect(result.factors.length).toBeGreaterThan(0);
    expect(result.factors.some(f => f.startsWith('sample_size:'))).toBe(true);
    expect(result.factors.some(f => f.startsWith('volatility:'))).toBe(true);
    expect(result.factors.some(f => f.startsWith('block_age:'))).toBe(true);
  });
});
