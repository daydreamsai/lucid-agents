import { describe, expect, it } from 'bun:test';
import {
  computeFreshness,
  propagateConfidence,
  type ConfidenceInput,
} from '../domain';

describe('freshness and confidence propagation', () => {
  it('marks stale payloads when age exceeds threshold', () => {
    const freshness = computeFreshness({
      asOf: new Date('2026-02-15T10:00:00.000Z'),
      now: new Date('2026-02-15T12:00:00.000Z'),
      maxAgeMs: 60 * 60 * 1000,
    });

    expect(freshness.is_stale).toBe(true);
    expect(freshness.age_ms).toBe(2 * 60 * 60 * 1000);
  });

  it('propagates lower confidence when stale and assumptions are sparse', () => {
    const highQuality: ConfidenceInput = {
      base: 0.9,
      freshnessPenalty: 0.0,
      assumptionCoverage: 1.0,
    };
    const lowQuality: ConfidenceInput = {
      base: 0.9,
      freshnessPenalty: 0.4,
      assumptionCoverage: 0.3,
    };

    const high = propagateConfidence(highQuality);
    const low = propagateConfidence(lowQuality);

    expect(low.score).toBeLessThan(high.score);
    expect(['low', 'medium', 'high']).toContain(low.band);
  });
});
