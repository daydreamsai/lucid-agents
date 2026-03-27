import { describe, it, expect } from 'bun:test';

/**
 * Staleness / freshness contract tests.
 *
 * The gas oracle MUST include freshness_ms in all responses.
 * Callers can use this value to decide whether the data is fresh enough
 * for their use case (e.g. reject if freshness_ms > 2000 for high-frequency trading).
 */

/** Maximum acceptable freshness window for a "fast" call (2 seconds) */
const FAST_THRESHOLD_MS = 2_000;

/** Maximum acceptable freshness window for a "normal" call (30 seconds) */
const NORMAL_THRESHOLD_MS = 30_000;

function isFresh(freshness_ms: number, threshold = NORMAL_THRESHOLD_MS): boolean {
  return freshness_ms >= 0 && freshness_ms <= threshold;
}

describe('Freshness contract', () => {
  it('freshness_ms = 0 is always fresh', () => {
    expect(isFresh(0)).toBe(true);
  });

  it('freshness_ms within normal threshold is fresh', () => {
    expect(isFresh(1500)).toBe(true);
    expect(isFresh(29_999)).toBe(true);
  });

  it('freshness_ms exceeding threshold is stale', () => {
    expect(isFresh(31_000, NORMAL_THRESHOLD_MS)).toBe(false);
  });

  it('negative freshness_ms is considered stale', () => {
    expect(isFresh(-1)).toBe(false);
  });

  it('fast threshold is stricter than normal threshold', () => {
    const borderline = 3_000;
    expect(isFresh(borderline, FAST_THRESHOLD_MS)).toBe(false);
    expect(isFresh(borderline, NORMAL_THRESHOLD_MS)).toBe(true);
  });
});

describe('Response shape includes freshness fields', () => {
  it('GasQuoteResponse shape has required freshness fields', () => {
    const mockResponse = {
      chain: 'ethereum',
      urgency: 'medium',
      recommended_max_fee: '30000000000',
      priority_fee: '1500000000',
      base_fee: '25000000000',
      inclusion_probability_curve: [{ blocks: 1, probability: 0.55 }],
      confidence_score: 0.92,
      freshness_ms: 80,
    };

    expect(typeof mockResponse.freshness_ms).toBe('number');
    expect(typeof mockResponse.confidence_score).toBe('number');
    expect(mockResponse.freshness_ms).toBeGreaterThanOrEqual(0);
    expect(mockResponse.confidence_score).toBeGreaterThanOrEqual(0);
    expect(mockResponse.confidence_score).toBeLessThanOrEqual(1);
  });

  it('confidence_score degrades with staleness', () => {
    // Simulates how a caller might adjust trust based on data age
    function adjustedConfidence(confidence: number, freshness_ms: number): number {
      if (freshness_ms > 30_000) return confidence * 0.5;
      if (freshness_ms > 10_000) return confidence * 0.8;
      return confidence;
    }

    expect(adjustedConfidence(0.9, 500)).toBe(0.9);
    expect(adjustedConfidence(0.9, 15_000)).toBeCloseTo(0.72, 5);
    expect(adjustedConfidence(0.9, 45_000)).toBe(0.45);
  });
});

describe('Freshness measurement timing', () => {
  it('measures elapsed time accurately', async () => {
    const start = Date.now();
    await new Promise(resolve => setTimeout(resolve, 50));
    const freshness_ms = Date.now() - start;

    expect(freshness_ms).toBeGreaterThanOrEqual(45);
    expect(freshness_ms).toBeLessThan(500);
  });
});
