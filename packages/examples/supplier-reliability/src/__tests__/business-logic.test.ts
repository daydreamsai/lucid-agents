import { describe, expect, it } from 'bun:test';
import {
  calculateSupplierScore,
  forecastLeadTime,
  detectDisruptions,
  calculateConfidence,
  calculateFreshness,
} from '../business-logic';

describe('Business Logic Tests', () => {
  describe('calculateSupplierScore', () => {
    it('should return score between 0 and 1', () => {
      const score = calculateSupplierScore('SUP-001', 'electronics', 'APAC');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should return consistent scores for same inputs', () => {
      const score1 = calculateSupplierScore('SUP-001', 'electronics', 'APAC');
      const score2 = calculateSupplierScore('SUP-001', 'electronics', 'APAC');
      expect(score1).toBe(score2);
    });

    it('should return different scores for different suppliers', () => {
      const score1 = calculateSupplierScore('SUP-001', 'electronics', 'APAC');
      const score2 = calculateSupplierScore('SUP-002', 'electronics', 'APAC');
      expect(score1).not.toBe(score2);
    });
  });

  describe('forecastLeadTime', () => {
    it('should return p95 >= p50', () => {
      const forecast = forecastLeadTime('SUP-001', 'electronics', 'APAC', 30);
      expect(forecast.lead_time_p95).toBeGreaterThanOrEqual(forecast.lead_time_p50);
    });

    it('should return non-negative lead times', () => {
      const forecast = forecastLeadTime('SUP-001', 'electronics', 'APAC', 30);
      expect(forecast.lead_time_p50).toBeGreaterThanOrEqual(0);
      expect(forecast.lead_time_p95).toBeGreaterThanOrEqual(0);
    });

    it('should return drift probability between 0 and 1', () => {
      const forecast = forecastLeadTime('SUP-001', 'electronics', 'APAC', 30);
      expect(forecast.drift_probability).toBeGreaterThanOrEqual(0);
      expect(forecast.drift_probability).toBeLessThanOrEqual(1);
    });

    it('should adjust forecast based on horizon', () => {
      const forecast30 = forecastLeadTime('SUP-001', 'electronics', 'APAC', 30);
      const forecast90 = forecastLeadTime('SUP-001', 'electronics', 'APAC', 90);
      expect(forecast90.drift_probability).toBeGreaterThanOrEqual(forecast30.drift_probability);
    });
  });

  describe('detectDisruptions', () => {
    it('should return probability between 0 and 1', () => {
      const result = detectDisruptions('SUP-001', 'APAC', 'medium');
      expect(result.disruption_probability).toBeGreaterThanOrEqual(0);
      expect(result.disruption_probability).toBeLessThanOrEqual(1);
    });

    it('should return valid severity levels', () => {
      const result = detectDisruptions('SUP-001', 'APAC', 'medium');
      expect(['low', 'medium', 'high', 'critical']).toContain(result.severity);
    });

    it('should return array of alert reasons', () => {
      const result = detectDisruptions('SUP-001', 'APAC', 'medium');
      expect(Array.isArray(result.alert_reasons)).toBe(true);
    });

    it('should adjust alerts based on risk tolerance', () => {
      const lowRisk = detectDisruptions('SUP-001', 'APAC', 'low');
      const highRisk = detectDisruptions('SUP-001', 'APAC', 'high');
      expect(lowRisk.alert_reasons.length).toBeGreaterThanOrEqual(highRisk.alert_reasons.length);
    });
  });

  describe('calculateConfidence', () => {
    it('should return value between 0 and 1', () => {
      const confidence = calculateConfidence(100);
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });

    it('should increase with more data points', () => {
      const conf10 = calculateConfidence(10);
      const conf100 = calculateConfidence(100);
      expect(conf100).toBeGreaterThan(conf10);
    });

    it('should handle zero data points', () => {
      const confidence = calculateConfidence(0);
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('calculateFreshness', () => {
    it('should return non-negative milliseconds', () => {
      const freshness = calculateFreshness();
      expect(freshness).toBeGreaterThanOrEqual(0);
    });

    it('should return reasonable freshness values', () => {
      const freshness = calculateFreshness();
      expect(freshness).toBeLessThan(86400000 * 7); // Less than 7 days
    });
  });
});
