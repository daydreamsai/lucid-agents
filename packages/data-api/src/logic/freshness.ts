import type { FreshnessMetadata, Confidence } from '../schemas/common';

const DEFAULT_STALE_THRESHOLD_MS = 30_000; // 30 seconds

export interface FreshnessInput {
  fetched_at: Date;
  block_number: number;
  block_timestamp_ms: number;
  data_source: 'live' | 'cached' | 'fallback';
  stale_threshold_ms?: number;
}

export function buildFreshness(input: FreshnessInput): FreshnessMetadata {
  const now = Date.now();
  const blockAgeMs = now - input.block_timestamp_ms;
  const threshold = input.stale_threshold_ms ?? DEFAULT_STALE_THRESHOLD_MS;

  return {
    fetched_at: input.fetched_at.toISOString(),
    block_number: input.block_number,
    block_age_ms: Math.max(0, blockAgeMs),
    stale: blockAgeMs > threshold,
    data_source: input.data_source,
  };
}

export interface ConfidenceInput {
  sample_size: number;          // number of recent blocks used
  base_fee_volatility: number;  // coefficient of variation (0-1+)
  block_age_ms: number;
  mempool_available: boolean;
}

export function computeConfidence(input: ConfidenceInput): Confidence {
  const factors: string[] = [];
  let score = 1.0;

  // Sample size factor
  if (input.sample_size >= 20) {
    factors.push('sample_size:high');
  } else if (input.sample_size >= 10) {
    factors.push('sample_size:medium');
    score -= 0.1;
  } else {
    factors.push('sample_size:low');
    score -= 0.25;
  }

  // Volatility factor
  if (input.base_fee_volatility < 0.1) {
    factors.push('volatility:low');
  } else if (input.base_fee_volatility < 0.3) {
    factors.push('volatility:medium');
    score -= 0.1;
  } else {
    factors.push('volatility:high');
    score -= 0.25;
  }

  // Block age factor
  if (input.block_age_ms < 5000) {
    factors.push('block_age:fresh');
  } else if (input.block_age_ms < 15000) {
    factors.push('block_age:recent');
    score -= 0.05;
  } else {
    factors.push('block_age:stale');
    score -= 0.15;
  }

  // Mempool visibility
  if (input.mempool_available) {
    factors.push('mempool_visibility:partial');
  } else {
    factors.push('mempool_visibility:none');
    score -= 0.05;
  }

  return {
    score: Math.round(Math.max(0, Math.min(1, score)) * 100) / 100,
    factors,
  };
}

/**
 * Compute coefficient of variation for an array of bigints.
 */
export function computeVolatility(values: bigint[]): number {
  if (values.length < 2) return 0;
  const nums = values.map(Number);
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  if (mean === 0) return 0;
  const variance = nums.reduce((sum, v) => sum + (v - mean) ** 2, 0) / nums.length;
  return Math.sqrt(variance) / mean;
}
