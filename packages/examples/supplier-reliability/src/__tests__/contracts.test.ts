import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import {
  SupplierScoreRequestSchema,
  SupplierScoreResponseSchema,
  LeadTimeForecastRequestSchema,
  LeadTimeForecastResponseSchema,
  DisruptionAlertsRequestSchema,
  DisruptionAlertsResponseSchema,
  ErrorResponseSchema,
} from '../schemas';

describe('Contract Tests - Request/Response Schemas', () => {
  describe('SupplierScoreRequestSchema', () => {
    it('should validate valid supplier score request', () => {
      const valid = {
        supplierId: 'SUP-12345',
        category: 'electronics',
        region: 'APAC',
      };
      expect(() => SupplierScoreRequestSchema.parse(valid)).not.toThrow();
    });

    it('should reject missing supplierId', () => {
      const invalid = {
        category: 'electronics',
        region: 'APAC',
      };
      expect(() => SupplierScoreRequestSchema.parse(invalid)).toThrow();
    });

    it('should reject invalid region', () => {
      const invalid = {
        supplierId: 'SUP-12345',
        category: 'electronics',
        region: 'INVALID',
      };
      expect(() => SupplierScoreRequestSchema.parse(invalid)).toThrow();
    });
  });

  describe('SupplierScoreResponseSchema', () => {
    it('should validate valid supplier score response', () => {
      const valid = {
        supplier_score: 0.85,
        confidence: 0.92,
        freshness_ms: 3600000,
        metadata: {
          data_points: 150,
          last_updated: '2024-02-27T00:00:00Z',
        },
      };
      expect(() => SupplierScoreResponseSchema.parse(valid)).not.toThrow();
    });

    it('should reject score out of range', () => {
      const invalid = {
        supplier_score: 1.5,
        confidence: 0.92,
        freshness_ms: 3600000,
      };
      expect(() => SupplierScoreResponseSchema.parse(invalid)).toThrow();
    });

    it('should reject negative freshness_ms', () => {
      const invalid = {
        supplier_score: 0.85,
        confidence: 0.92,
        freshness_ms: -100,
      };
      expect(() => SupplierScoreResponseSchema.parse(invalid)).toThrow();
    });
  });

  describe('LeadTimeForecastRequestSchema', () => {
    it('should validate valid lead time forecast request', () => {
      const valid = {
        supplierId: 'SUP-12345',
        category: 'electronics',
        region: 'APAC',
        horizonDays: 30,
      };
      expect(() => LeadTimeForecastRequestSchema.parse(valid)).not.toThrow();
    });

    it('should reject horizonDays out of range', () => {
      const invalid = {
        supplierId: 'SUP-12345',
        category: 'electronics',
        region: 'APAC',
        horizonDays: 400,
      };
      expect(() => LeadTimeForecastRequestSchema.parse(invalid)).toThrow();
    });

    it('should use default horizonDays when not provided', () => {
      const input = {
        supplierId: 'SUP-12345',
        category: 'electronics',
        region: 'APAC',
      };
      const parsed = LeadTimeForecastRequestSchema.parse(input);
      expect(parsed.horizonDays).toBe(30);
    });
  });

  describe('LeadTimeForecastResponseSchema', () => {
    it('should validate valid lead time forecast response', () => {
      const valid = {
        lead_time_p50: 15,
        lead_time_p95: 28,
        drift_probability: 0.12,
        confidence: 0.88,
        freshness_ms: 7200000,
      };
      expect(() => LeadTimeForecastResponseSchema.parse(valid)).not.toThrow();
    });

    it('should reject p95 less than p50', () => {
      const invalid = {
        lead_time_p50: 28,
        lead_time_p95: 15,
        drift_probability: 0.12,
        confidence: 0.88,
        freshness_ms: 7200000,
      };
      expect(() => LeadTimeForecastResponseSchema.parse(invalid)).toThrow();
    });
  });

  describe('DisruptionAlertsRequestSchema', () => {
    it('should validate valid disruption alerts request', () => {
      const valid = {
        supplierId: 'SUP-12345',
        region: 'APAC',
        riskTolerance: 'medium',
      };
      expect(() => DisruptionAlertsRequestSchema.parse(valid)).not.toThrow();
    });

    it('should reject invalid riskTolerance', () => {
      const invalid = {
        supplierId: 'SUP-12345',
        region: 'APAC',
        riskTolerance: 'extreme',
      };
      expect(() => DisruptionAlertsRequestSchema.parse(invalid)).toThrow();
    });

    it('should use default riskTolerance when not provided', () => {
      const input = {
        supplierId: 'SUP-12345',
        region: 'APAC',
      };
      const parsed = DisruptionAlertsRequestSchema.parse(input);
      expect(parsed.riskTolerance).toBe('medium');
    });
  });

  describe('DisruptionAlertsResponseSchema', () => {
    it('should validate valid disruption alerts response', () => {
      const valid = {
        disruption_probability: 0.23,
        alert_reasons: ['port_congestion', 'weather_event'],
        severity: 'medium',
        confidence: 0.79,
        freshness_ms: 1800000,
      };
      expect(() => DisruptionAlertsResponseSchema.parse(valid)).not.toThrow();
    });

    it('should accept empty alert_reasons array', () => {
      const valid = {
        disruption_probability: 0.05,
        alert_reasons: [],
        severity: 'low',
        confidence: 0.95,
        freshness_ms: 1800000,
      };
      expect(() => DisruptionAlertsResponseSchema.parse(valid)).not.toThrow();
    });

    it('should reject invalid severity', () => {
      const invalid = {
        disruption_probability: 0.23,
        alert_reasons: ['port_congestion'],
        severity: 'extreme',
        confidence: 0.79,
        freshness_ms: 1800000,
      };
      expect(() => DisruptionAlertsResponseSchema.parse(invalid)).toThrow();
    });
  });

  describe('ErrorResponseSchema', () => {
    it('should validate valid error response', () => {
      const valid = {
        error: {
          code: 'INVALID_SUPPLIER_ID',
          message: 'Supplier ID not found',
        },
      };
      expect(() => ErrorResponseSchema.parse(valid)).not.toThrow();
    });

    it('should accept error with details', () => {
      const valid = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input parameters',
          details: { field: 'region', issue: 'unsupported value' },
        },
      };
      expect(() => ErrorResponseSchema.parse(valid)).not.toThrow();
    });
  });
});
