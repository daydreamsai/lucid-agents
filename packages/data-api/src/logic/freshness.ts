import type { FreshnessMetadata, Confidence, MempoolVisibility } from '../schemas/common';

const DEFAULT_STALE_THRESHOLD_MS = 30_000; // 30 seconds

/** Input for building freshness metadata. */
export interface FreshnessInput {
  fetched_at: Date;
  block_number: number;
  block_timestamp_ms: number;
  data_source: FreshnessMetadata['data_source'];
  stale_threshold_ms?: number;
}

/** Build freshness metadata from block data. Marks data as stale if block age exceeds threshold. */
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

/** Input for computing confidence score. */
export interface ConfidenceInput {
  sample_size: number;
  base_fee_volatility: number;
  block_age_ms: number;
  mempool_visibility: MempoolVisibility;
}

/** Compute a confidence score (0-1) based on data quality factors. */
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
  if (input.mempool_visibility === 'full') {
    factors.push('mempool_visibility:full');
  } else if (input.mempool_visibility === 'partial') {
    factors.push('mempool_visibility:partial');
    score -= 0.02;
  } else {
    factors.push('mempool_visibility:none');
    score -= 0.05;
  }

  return {
    score: Math.round(Math.max(0, Math.min(1, score)) * 100) / 100,
    factors,
  };
}

/** Compute coefficient of variation for an array of bigints. */
export function computeVolatility(values: bigint[]): number {
  if (values.length < 2) return 0;
  const nums = values.map(Number);
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  if (mean === 0) return 0;
  const variance = nums.reduce((sum, v) => sum + (v - mean) ** 2, 0) / nums.length;
  return Math.sqrt(variance) / mean;
}
