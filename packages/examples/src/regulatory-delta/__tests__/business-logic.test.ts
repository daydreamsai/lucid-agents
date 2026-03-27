import { describe, expect, it } from 'bun:test';
import {
  calculateUrgencyScore,
  filterDeltasBySince,
  rankDeltasByUrgency,
  mapControlsToRegulation,
  calculateConfidenceScore,
  type RuleDiff,
} from '../business-logic';

/**
 * Business logic tests for Regulatory Delta Feed
 * Tests core data transforms, ranking, and scoring behavior (TDD Step 2)
 */

describe('Regulatory Delta - Business Logic', () => {
  describe('Urgency Score Calculation', () => {
    it('assigns high urgency (8-10) for added rules with near effective dates', () => {
      const score = calculateUrgencyScore(
        'added',
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        'high'
      );
      expect(score).toBeGreaterThanOrEqual(8);
      expect(score).toBeLessThanOrEqual(10);
    });

    it('assigns medium urgency (4-7) for modified rules', () => {
      const score = calculateUrgencyScore(
        'modified',
        new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        'medium'
      );
      expect(score).toBeGreaterThanOrEqual(4);
      expect(score).toBeLessThanOrEqual(7);
    });

    it('assigns low urgency (1-3) for clarified rules with distant effective dates', () => {
      const score = calculateUrgencyScore(
        'clarified',
        new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        'low'
      );
      expect(score).toBeGreaterThanOrEqual(1);
      expect(score).toBeLessThanOrEqual(3);
    });

    it('assigns maximum urgency (10) for removed rules effective immediately', () => {
      const score = calculateUrgencyScore(
        'removed',
        new Date().toISOString(),
        'high'
      );
      expect(score).toBe(10);
    });
  });

  describe('Delta Filtering by Date', () => {
    const mockDeltas: RuleDiff[] = [
      {
        rule_id: 'R1',
        jurisdiction: 'US',
        semantic_change_type: 'added',
        diff_text: 'New rule',
        effective_date: '2024-01-15T00:00:00Z',
        urgency_score: 8,
        freshness_timestamp: '2024-01-15T00:00:00Z',
        confidence_score: 0.9,
      },
      {
        rule_id: 'R2',
        jurisdiction: 'US',
        semantic_change_type: 'modified',
        diff_text: 'Updated rule',
        effective_date: '2024-02-20T00:00:00Z',
        urgency_score: 6,
        freshness_timestamp: '2024-02-20T00:00:00Z',
        confidence_score: 0.85,
      },
      {
        rule_id: 'R3',
        jurisdiction: 'US',
        semantic_change_type: 'clarified',
        diff_text: 'Clarified rule',
        effective_date: '2023-12-01T00:00:00Z',
        urgency_score: 3,
        freshness_timestamp: '2023-12-01T00:00:00Z',
        confidence_score: 0.95,
      },
    ];

    it('filters deltas after specified date', () => {
      const filtered = filterDeltasBySince(mockDeltas, '2024-01-01T00:00:00Z');
      expect(filtered.length).toBe(2);
      expect(filtered.every(d => d.effective_date >= '2024-01-01T00:00:00Z')).toBe(true);
    });

    it('returns all deltas when since date is before all deltas', () => {
      const filtered = filterDeltasBySince(mockDeltas, '2023-01-01T00:00:00Z');
      expect(filtered.length).toBe(3);
    });

    it('returns empty array when since date is after all deltas', () => {
      const filtered = filterDeltasBySince(mockDeltas, '2025-01-01T00:00:00Z');
      expect(filtered.length).toBe(0);
    });
  });

  describe('Delta Ranking by Urgency', () => {
    const mockDeltas: RuleDiff[] = [
      {
        rule_id: 'R1',
        jurisdiction: 'US',
        semantic_change_type: 'clarified',
        diff_text: 'Low priority',
        effective_date: '2024-12-01T00:00:00Z',
        urgency_score: 3,
        freshness_timestamp: '2024-02-27T00:00:00Z',
        confidence_score: 0.9,
      },
      {
        rule_id: 'R2',
        jurisdiction: 'US',
        semantic_change_type: 'removed',
        diff_text: 'High priority',
        effective_date: '2024-03-01T00:00:00Z',
        urgency_score: 10,
        freshness_timestamp: '2024-02-27T00:00:00Z',
        confidence_score: 0.95,
      },
      {
        rule_id: 'R3',
        jurisdiction: 'US',
        semantic_change_type: 'modified',
        diff_text: 'Medium priority',
        effective_date: '2024-06-01T00:00:00Z',
        urgency_score: 6,
        freshness_timestamp: '2024-02-27T00:00:00Z',
        confidence_score: 0.85,
      },
    ];

    it('ranks deltas by urgency score descending', () => {
      const ranked = rankDeltasByUrgency(mockDeltas);
      expect(ranked[0].urgency_score).toBe(10);
      expect(ranked[1].urgency_score).toBe(6);
      expect(ranked[2].urgency_score).toBe(3);
    });

    it('preserves all deltas during ranking', () => {
      const ranked = rankDeltasByUrgency(mockDeltas);
      expect(ranked.length).toBe(mockDeltas.length);
    });
  });

  describe('Control Mapping', () => {
    it('maps regulation to relevant controls for SOC2 framework', () => {
      const mappings = mapControlsToRegulation('SEC-2024-001', 'SOC2');
      expect(mappings.length).toBeGreaterThan(0);
      expect(mappings[0]).toHaveProperty('control_id');
      expect(mappings[0]).toHaveProperty('control_name');
      expect(mappings[0]).toHaveProperty('impact_level');
      expect(mappings[0]).toHaveProperty('remediation_required');
    });

    it('returns different mappings for different frameworks', () => {
      const soc2Mappings = mapControlsToRegulation('SEC-2024-001', 'SOC2');
      const iso27001Mappings = mapControlsToRegulation('SEC-2024-001', 'ISO27001');
      expect(soc2Mappings).not.toEqual(iso27001Mappings);
    });

    it('marks high-impact controls as requiring remediation', () => {
      const mappings = mapControlsToRegulation('SEC-2024-001', 'SOC2');
      const highImpact = mappings.filter(m => m.impact_level === 'high');
      expect(highImpact.every(m => m.remediation_required)).toBe(true);
    });
  });

  describe('Confidence Score Calculation', () => {
    it('returns high confidence (>0.9) for fresh data from quality sources', () => {
      const score = calculateConfidenceScore(1.0, 1);
      expect(score).toBeGreaterThan(0.9);
    });

    it('returns medium confidence (0.7-0.9) for moderately aged data', () => {
      const score = calculateConfidenceScore(0.8, 7);
      expect(score).toBeGreaterThanOrEqual(0.7);
      expect(score).toBeLessThanOrEqual(0.9);
    });

    it('returns low confidence (<0.7) for stale data', () => {
      const score = calculateConfidenceScore(0.6, 30);
      expect(score).toBeLessThan(0.7);
    });

    it('confidence decreases as data age increases', () => {
      const fresh = calculateConfidenceScore(0.9, 1);
      const aged = calculateConfidenceScore(0.9, 14);
      expect(fresh).toBeGreaterThan(aged);
    });
  });

  describe('Date Handling Edge Cases', () => {
    it('handles ISO 8601 datetime strings correctly', () => {
      const validDate = '2024-02-27T12:00:00Z';
      expect(() => new Date(validDate).toISOString()).not.toThrow();
    });

    it('handles timezone offsets in effective dates', () => {
      const dateWithOffset = '2024-02-27T12:00:00+05:00';
      const parsed = new Date(dateWithOffset);
      expect(parsed.toISOString()).toBe('2024-02-27T07:00:00.000Z');
    });
  });
});
