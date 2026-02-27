import { describe, test, expect } from 'bun:test';
import {
  calculateInclusionProbability,
  determineCongestionState,
  calculateConfidenceScore,
  adjustFeeForUrgency,
  generateInclusionCurve,
  forecastBaseFee,
  determineBasFeeTrend,
} from '../core';

describe('Core Business Logic - Unit Tests', () => {
  describe('calculateInclusionProbability', () => {
    test('should return higher probability for higher priority fees', () => {
      const baseFee = BigInt(30e9);
      const lowPriority = BigInt(1e9);
      const highPriority = BigInt(5e9);

      const lowProb = calculateInclusionProbability(baseFee, lowPriority, 'medium', 1);
      const highProb = calculateInclusionProbability(baseFee, highPriority, 'medium', 1);

      expect(highProb).toBeGreaterThan(lowProb);
    });

    test('should increase probability with more blocks', () => {
      const baseFee = BigInt(30e9);
      const priority = BigInt(2e9);

      const prob1 = calculateInclusionProbability(baseFee, priority, 'medium', 1);
      const prob3 = calculateInclusionProbability(baseFee, priority, 'medium', 3);
      const prob5 = calculateInclusionProbability(baseFee, priority, 'medium', 5);

      expect(prob3).toBeGreaterThan(prob1);
      expect(prob5).toBeGreaterThan(prob3);
    });

    test('should respect urgency multipliers', () => {
      const baseFee = BigInt(30e9);
      const priority = BigInt(2e9);

      const lowProb = calculateInclusionProbability(baseFee, priority, 'low', 2);
      const mediumProb = calculateInclusionProbability(baseFee, priority, 'medium', 2);
      const highProb = calculateInclusionProbability(baseFee, priority, 'high', 2);
      const urgentProb = calculateInclusionProbability(baseFee, priority, 'urgent', 2);

      expect(mediumProb).toBeGreaterThan(lowProb);
      expect(highProb).toBeGreaterThan(mediumProb);
      expect(urgentProb).toBeGreaterThan(highProb);
    });

    test('should never exceed 1.0 probability', () => {
      const baseFee = BigInt(30e9);
      const priority = BigInt(50e9); // Very high priority

      const prob = calculateInclusionProbability(baseFee, priority, 'urgent', 10);

      expect(prob).toBeLessThanOrEqual(1.0);
      expect(prob).toBeGreaterThanOrEqual(0);
    });

    test('should never go below 0 probability', () => {
      const baseFee = BigInt(30e9);
      const priority = BigInt(0);

      const prob = calculateInclusionProbability(baseFee, priority, 'low', 1);

      expect(prob).toBeGreaterThanOrEqual(0);
      expect(prob).toBeLessThanOrEqual(1.0);
    });
  });

  describe('determineCongestionState', () => {
    test('should return severe for high utilization', () => {
      const state = determineCongestionState(25000, 0.95);
      expect(state).toBe('severe');
    });

    test('should return high for moderate-high utilization', () => {
      const state = determineCongestionState(12000, 0.8);
      expect(state).toBe('high');
    });

    test('should return moderate for medium utilization', () => {
      const state = determineCongestionState(7000, 0.6);
      expect(state).toBe('moderate');
    });

    test('should return low for low utilization', () => {
      const state = determineCongestionState(3000, 0.3);
      expect(state).toBe('low');
    });

    test('should prioritize pending tx count over utilization', () => {
      const state1 = determineCongestionState(25000, 0.4);
      expect(state1).toBe('severe');

      const state2 = determineCongestionState(15000, 0.5);
      expect(state2).toBe('high');
    });
  });

  describe('calculateConfidenceScore', () => {
    test('should return high confidence for fresh data', () => {
      const score = calculateConfidenceScore(1000, 0.05);
      expect(score).toBeGreaterThan(0.7);
    });

    test('should decrease confidence with stale data', () => {
      const fresh = calculateConfidenceScore(1000, 0.05);
      const stale = calculateConfidenceScore(10000, 0.05);

      expect(stale).toBeLessThan(fresh);
    });

    test('should decrease confidence with high volatility', () => {
      const lowVol = calculateConfidenceScore(2000, 0.05);
      const highVol = calculateConfidenceScore(2000, 0.3);

      expect(highVol).toBeLessThan(lowVol);
    });

    test('should never go below minimum threshold', () => {
      const score = calculateConfidenceScore(100000, 0.9);
      expect(score).toBeGreaterThanOrEqual(0.1);
    });
  });

  describe('adjustFeeForUrgency', () => {
    test('should increase fees for higher urgency', () => {
      const baseFee = BigInt(30e9);
      const priority = BigInt(2e9);

      const low = adjustFeeForUrgency(baseFee, priority, 'low', 'transfer');
      const medium = adjustFeeForUrgency(baseFee, priority, 'medium', 'transfer');
      const high = adjustFeeForUrgency(baseFee, priority, 'high', 'transfer');
      const urgent = adjustFeeForUrgency(baseFee, priority, 'urgent', 'transfer');

      expect(medium.priority).toBeGreaterThan(low.priority);
      expect(high.priority).toBeGreaterThan(medium.priority);
      expect(urgent.priority).toBeGreaterThan(high.priority);
    });

    test('should increase fees for complex tx types', () => {
      const baseFee = BigInt(30e9);
      const priority = BigInt(2e9);

      const transfer = adjustFeeForUrgency(baseFee, priority, 'medium', 'transfer');
      const swap = adjustFeeForUrgency(baseFee, priority, 'medium', 'swap');
      const contract = adjustFeeForUrgency(baseFee, priority, 'medium', 'contract');

      expect(swap.priority).toBeGreaterThan(transfer.priority);
      expect(contract.priority).toBeGreaterThan(swap.priority);
    });

    test('should maintain maxFee = baseFee + priority relationship', () => {
      const baseFee = BigInt(30e9);
      const priority = BigInt(2e9);

      const result = adjustFeeForUrgency(baseFee, priority, 'high', 'swap');

      expect(result.maxFee).toBe(baseFee + result.priority);
    });
  });

  describe('generateInclusionCurve', () => {
    test('should generate monotonically increasing probabilities', () => {
      const baseFee = BigInt(30e9);
      const priority = BigInt(2e9);

      const curve = generateInclusionCurve(baseFee, priority, 'medium', 5);

      expect(curve).toHaveLength(5);
      for (let i = 1; i < curve.length; i++) {
        expect(curve[i].probability).toBeGreaterThanOrEqual(curve[i - 1].probability);
      }
    });

    test('should have sequential block numbers', () => {
      const baseFee = BigInt(30e9);
      const priority = BigInt(2e9);

      const curve = generateInclusionCurve(baseFee, priority, 'medium', 5);

      for (let i = 0; i < curve.length; i++) {
        expect(curve[i].blocks).toBe(i + 1);
      }
    });

    test('should respect maxBlocks parameter', () => {
      const baseFee = BigInt(30e9);
      const priority = BigInt(2e9);

      const curve3 = generateInclusionCurve(baseFee, priority, 'medium', 3);
      const curve10 = generateInclusionCurve(baseFee, priority, 'medium', 10);

      expect(curve3).toHaveLength(3);
      expect(curve10).toHaveLength(10);
    });
  });

  describe('forecastBaseFee', () => {
    test('should increase base fee when utilization is high', () => {
      const currentBaseFee = BigInt(30e9);
      const forecasted = forecastBaseFee(currentBaseFee, 0.8, 5);

      expect(forecasted).toBeGreaterThan(currentBaseFee);
    });

    test('should decrease base fee when utilization is low', () => {
      const currentBaseFee = BigInt(30e9);
      const forecasted = forecastBaseFee(currentBaseFee, 0.2, 5);

      expect(forecasted).toBeLessThan(currentBaseFee);
    });

    test('should remain stable at target utilization', () => {
      const currentBaseFee = BigInt(30e9);
      const forecasted = forecastBaseFee(currentBaseFee, 0.5, 5);

      const diff = Number(forecasted - currentBaseFee);
      const threshold = Number(currentBaseFee) * 0.01; // 1% threshold

      expect(Math.abs(diff)).toBeLessThan(threshold);
    });

    test('should compound changes over multiple blocks', () => {
      const currentBaseFee = BigInt(30e9);
      const forecast1 = forecastBaseFee(currentBaseFee, 0.8, 1);
      const forecast5 = forecastBaseFee(currentBaseFee, 0.8, 5);

      const change1 = Number(forecast1 - currentBaseFee);
      const change5 = Number(forecast5 - currentBaseFee);

      expect(change5).toBeGreaterThan(change1 * 3); // Non-linear growth
    });
  });

  describe('determineBasFeeTrend', () => {
    test('should detect rising trend', () => {
      const previous = BigInt(30e9);
      const current = BigInt(35e9);

      const trend = determineBasFeeTrend(current, previous);
      expect(trend).toBe('rising');
    });

    test('should detect falling trend', () => {
      const previous = BigInt(30e9);
      const current = BigInt(25e9);

      const trend = determineBasFeeTrend(current, previous);
      expect(trend).toBe('falling');
    });

    test('should detect stable trend for small changes', () => {
      const previous = BigInt(30e9);
      const current = BigInt(30.5e9);

      const trend = determineBasFeeTrend(current, previous);
      expect(trend).toBe('stable');
    });

    test('should use 5% threshold for trend detection', () => {
      const previous = BigInt(30e9);
      const justBelowThreshold = BigInt(31.4e9); // 4.67% increase
      const justAboveThreshold = BigInt(31.6e9); // 5.33% increase

      expect(determineBasFeeTrend(justBelowThreshold, previous)).toBe('stable');
      expect(determineBasFeeTrend(justAboveThreshold, previous)).toBe('rising');
    });
  });
});
