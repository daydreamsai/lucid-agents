import { describe, expect, it } from 'bun:test';
import {
  calculateTrustScore,
  calculateCompletionRate,
  calculateDisputeRate,
  calculateConfidence,
  aggregateTrustBreakdown,
} from '../scoring';

describe('Business Logic Tests - Scoring and Ranking', () => {
  describe('calculateTrustScore', () => {
    it('returns weighted average of components', () => {
      const components = {
        onchain_reputation: 80,
        completion_history: 90,
        dispute_resolution: 85,
        peer_endorsements: 75,
      };
      const weights = {
        onchain_reputation: 0.4,
        completion_history: 0.3,
        dispute_resolution: 0.2,
        peer_endorsements: 0.1,
      };
      const score = calculateTrustScore(components, weights);
      // 80*0.4 + 90*0.3 + 85*0.2 + 75*0.1 = 32 + 27 + 17 + 7.5 = 83.5
      expect(score).toBeCloseTo(83.5, 1);
    });

    it('returns 0 when all components are 0', () => {
      const components = {
        onchain_reputation: 0,
        completion_history: 0,
        dispute_resolution: 0,
        peer_endorsements: 0,
      };
      const weights = {
        onchain_reputation: 0.4,
        completion_history: 0.3,
        dispute_resolution: 0.2,
        peer_endorsements: 0.1,
      };
      const score = calculateTrustScore(components, weights);
      expect(score).toBe(0);
    });

    it('handles edge case with single component', () => {
      const components = {
        onchain_reputation: 100,
        completion_history: 0,
        dispute_resolution: 0,
        peer_endorsements: 0,
      };
      const weights = {
        onchain_reputation: 1.0,
        completion_history: 0,
        dispute_resolution: 0,
        peer_endorsements: 0,
      };
      const score = calculateTrustScore(components, weights);
      expect(score).toBe(100);
    });
  });

  describe('calculateCompletionRate', () => {
    it('calculates rate from completed and total tasks', () => {
      const rate = calculateCompletionRate(95, 100);
      expect(rate).toBe(0.95);
    });

    it('returns 0 when no tasks completed', () => {
      const rate = calculateCompletionRate(0, 100);
      expect(rate).toBe(0);
    });

    it('returns 1 when all tasks completed', () => {
      const rate = calculateCompletionRate(100, 100);
      expect(rate).toBe(1);
    });

    it('returns 0 when total is 0', () => {
      const rate = calculateCompletionRate(0, 0);
      expect(rate).toBe(0);
    });
  });

  describe('calculateDisputeRate', () => {
    it('calculates rate from disputes and total interactions', () => {
      const rate = calculateDisputeRate(2, 100);
      expect(rate).toBe(0.02);
    });

    it('returns 0 when no disputes', () => {
      const rate = calculateDisputeRate(0, 100);
      expect(rate).toBe(0);
    });

    it('returns 0 when total is 0', () => {
      const rate = calculateDisputeRate(0, 0);
      expect(rate).toBe(0);
    });
  });

  describe('calculateConfidence', () => {
    it('returns high confidence for recent data with many samples', () => {
      const confidence = calculateConfidence(100, 60); // 100 samples, 60 seconds old
      expect(confidence).toBeGreaterThan(0.8);
    });

    it('returns low confidence for old data', () => {
      const confidence = calculateConfidence(100, 86400); // 1 day old
      expect(confidence).toBeLessThan(0.5);
    });

    it('returns low confidence for few samples', () => {
      const confidence = calculateConfidence(5, 60);
      expect(confidence).toBeLessThan(0.5);
    });

    it('returns 0 confidence for no samples', () => {
      const confidence = calculateConfidence(0, 60);
      expect(confidence).toBe(0);
    });
  });

  describe('aggregateTrustBreakdown', () => {
    it('aggregates feedback data into trust components', () => {
      const feedbackData = [
        { value: 90, valueDecimals: 0, tag1: 'reliable', isRevoked: false },
        { value: 85, valueDecimals: 0, tag1: 'fast', isRevoked: false },
        { value: 95, valueDecimals: 0, tag1: 'reliable', isRevoked: false },
      ];
      const breakdown = aggregateTrustBreakdown(feedbackData, 10, 1);
      
      expect(breakdown.components.onchain_reputation).toBeGreaterThan(0);
      expect(breakdown.components.completion_history).toBeGreaterThan(0);
      expect(breakdown.overall_score).toBeGreaterThan(0);
      expect(breakdown.overall_score).toBeLessThanOrEqual(100);
    });

    it('handles empty feedback data', () => {
      const breakdown = aggregateTrustBreakdown([], 0, 0);
      
      expect(breakdown.components.onchain_reputation).toBe(0);
      expect(breakdown.overall_score).toBe(0);
    });

    it('filters out revoked feedback', () => {
      const feedbackData = [
        { value: 90, valueDecimals: 0, tag1: 'reliable', isRevoked: false },
        { value: 10, valueDecimals: 0, tag1: 'bad', isRevoked: true },
      ];
      const breakdown = aggregateTrustBreakdown(feedbackData, 10, 1);
      
      // Should only count the non-revoked feedback
      expect(breakdown.components.onchain_reputation).toBeGreaterThan(50);
    });
  });
});
