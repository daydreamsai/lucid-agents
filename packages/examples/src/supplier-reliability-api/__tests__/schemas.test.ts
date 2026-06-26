/**
 * Contract Tests - Schema Validation
 */
import { describe, it, expect } from 'bun:test';
import {
  SupplierScoreInputSchema, SupplierScoreOutputSchema,
  LeadTimeForecastInputSchema, LeadTimeForecastOutputSchema,
  DisruptionAlertsInputSchema, DisruptionAlertsOutputSchema,
  ErrorEnvelopeSchema, ConfidenceSchema, FreshnessMetadataSchema, AlertReasonSchema,
} from '../schemas';

describe('Contract Tests - Schema Validation', () => {
  describe('SupplierScoreInputSchema', () => {
    it('should accept valid input with all fields', () => {
      expect(SupplierScoreInputSchema.safeParse({ supplierId: 'SUP001', category: 'electronics', region: 'APAC' }).success).toBe(true);
    });
    it('should accept input with only required fields', () => {
      expect(SupplierScoreInputSchema.safeParse({ supplierId: 'SUP001' }).success).toBe(true);
    });
    it('should reject empty supplierId', () => {
      expect(SupplierScoreInputSchema.safeParse({ supplierId: '' }).success).toBe(false);
    });
  });

  describe('SupplierScoreOutputSchema', () => {
    it('should accept valid output', () => {
      const output = { supplier_id: 'SUP001', supplier_score: 85.5, fill_rate: 0.95, on_time_delivery_rate: 0.92, quality_score: 88,
        confidence: { level: 'high', score: 0.85, sample_size: 1250 },
        freshness: { freshness_ms: 3600000, last_updated: '2024-01-15T10:00:00.000Z', source: 'supplier-db-v1' } };
      expect(SupplierScoreOutputSchema.safeParse(output).success).toBe(true);
    });
    it('should reject score outside 0-100 range', () => {
      const output = { supplier_id: 'SUP001', supplier_score: 150, fill_rate: 0.95, on_time_delivery_rate: 0.92, quality_score: 88,
        confidence: { level: 'high', score: 0.85, sample_size: 1250 },
        freshness: { freshness_ms: 3600000, last_updated: '2024-01-15T10:00:00.000Z', source: 'test' } };
      expect(SupplierScoreOutputSchema.safeParse(output).success).toBe(false);
    });
  });

  describe('LeadTimeForecastInputSchema', () => {
    it('should accept valid input', () => {
      expect(LeadTimeForecastInputSchema.safeParse({ supplierId: 'SUP001', category: 'electronics', region: 'APAC', horizonDays: 30 }).success).toBe(true);
    });
    it('should use default horizonDays', () => {
      const result = LeadTimeForecastInputSchema.safeParse({ supplierId: 'SUP001', category: 'electronics', region: 'APAC' });
      expect(result.success && result.data.horizonDays).toBe(30);
    });
    it('should reject horizonDays > 365', () => {
      expect(LeadTimeForecastInputSchema.safeParse({ supplierId: 'SUP001', category: 'electronics', region: 'APAC', horizonDays: 400 }).success).toBe(false);
    });
  });

  describe('LeadTimeForecastOutputSchema', () => {
    it('should accept valid output', () => {
      const output = { supplier_id: 'SUP001', category: 'electronics', region: 'APAC', horizon_days: 30,
        lead_time_p50: 14.5, lead_time_p95: 21.2, lead_time_drift: 1.5, trend: 'stable',
        confidence: { level: 'high', score: 0.85, sample_size: 1250 },
        freshness: { freshness_ms: 3600000, last_updated: '2024-01-15T10:00:00.000Z', source: 'forecast-model-v2' } };
      expect(LeadTimeForecastOutputSchema.safeParse(output).success).toBe(true);
    });
    it('should reject negative lead times', () => {
      const output = { supplier_id: 'SUP001', category: 'electronics', region: 'APAC', horizon_days: 30,
        lead_time_p50: -5, lead_time_p95: 21.2, lead_time_drift: 1.5, trend: 'stable',
        confidence: { level: 'high', score: 0.85, sample_size: 1250 },
        freshness: { freshness_ms: 3600000, last_updated: '2024-01-15T10:00:00.000Z', source: 'test' } };
      expect(LeadTimeForecastOutputSchema.safeParse(output).success).toBe(false);
    });
  });

  describe('DisruptionAlertsInputSchema', () => {
    it('should accept valid input', () => {
      expect(DisruptionAlertsInputSchema.safeParse({ supplierId: 'SUP001', riskTolerance: 'medium' }).success).toBe(true);
    });
    it('should use default riskTolerance', () => {
      const result = DisruptionAlertsInputSchema.safeParse({ supplierId: 'SUP001' });
      expect(result.success && result.data.riskTolerance).toBe('medium');
    });
    it('should reject invalid riskTolerance', () => {
      expect(DisruptionAlertsInputSchema.safeParse({ supplierId: 'SUP001', riskTolerance: 'extreme' }).success).toBe(false);
    });
  });

  describe('DisruptionAlertsOutputSchema', () => {
    it('should accept valid output with alerts', () => {
      const output = { supplier_id: 'SUP001', disruption_probability: 0.35, risk_level: 'medium',
        alert_reasons: [{ code: 'port_congestion', description: 'Port congestion', severity: 'warning', detected_at: '2024-01-15T10:00:00.000Z' }],
        recommended_actions: ['Explore alternative routes'],
        confidence: { level: 'high', score: 0.85, sample_size: 1250 },
        freshness: { freshness_ms: 3600000, last_updated: '2024-01-15T10:00:00.000Z', source: 'risk-engine-v1' } };
      expect(DisruptionAlertsOutputSchema.safeParse(output).success).toBe(true);
    });
    it('should reject disruption_probability > 1', () => {
      const output = { supplier_id: 'SUP001', disruption_probability: 1.5, risk_level: 'high',
        alert_reasons: [], recommended_actions: [],
        confidence: { level: 'high', score: 0.85, sample_size: 1250 },
        freshness: { freshness_ms: 3600000, last_updated: '2024-01-15T10:00:00.000Z', source: 'test' } };
      expect(DisruptionAlertsOutputSchema.safeParse(output).success).toBe(false);
    });
  });

  describe('ErrorEnvelopeSchema', () => {
    it('should accept valid error envelope', () => {
      expect(ErrorEnvelopeSchema.safeParse({ error: { code: 'supplier_not_found', message: 'Not found' } }).success).toBe(true);
    });
    it('should accept all error codes', () => {
      for (const code of ['invalid_input', 'supplier_not_found', 'payment_required', 'rate_limited', 'internal_error', 'stale_data']) {
        expect(ErrorEnvelopeSchema.safeParse({ error: { code, message: 'Test' } }).success).toBe(true);
      }
    });
    it('should reject invalid error code', () => {
      expect(ErrorEnvelopeSchema.safeParse({ error: { code: 'unknown_error', message: 'Test' } }).success).toBe(false);
    });
  });

  describe('ConfidenceSchema', () => {
    it('should accept all confidence levels', () => {
      for (const level of ['low', 'medium', 'high']) {
        expect(ConfidenceSchema.safeParse({ level, score: 0.5, sample_size: 100 }).success).toBe(true);
      }
    });
    it('should reject score > 1', () => {
      expect(ConfidenceSchema.safeParse({ level: 'high', score: 1.5, sample_size: 100 }).success).toBe(false);
    });
  });

  describe('FreshnessMetadataSchema', () => {
    it('should accept valid freshness', () => {
      expect(FreshnessMetadataSchema.safeParse({ freshness_ms: 3600000, last_updated: '2024-01-15T10:00:00.000Z', source: 'test' }).success).toBe(true);
    });
    it('should reject invalid datetime', () => {
      expect(FreshnessMetadataSchema.safeParse({ freshness_ms: 3600000, last_updated: 'invalid', source: 'test' }).success).toBe(false);
    });
  });

  describe('AlertReasonSchema', () => {
    it('should accept all severity levels', () => {
      for (const severity of ['info', 'warning', 'critical']) {
        expect(AlertReasonSchema.safeParse({ code: 'test', description: 'Test', severity, detected_at: '2024-01-15T10:00:00.000Z' }).success).toBe(true);
      }
    });
  });
});
