import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

/**
 * Contract tests for Regulatory Delta Feed API
 * These tests define the expected request/response schemas and error envelopes
 * before any implementation exists (TDD Step 1)
 */

// Request schemas
const DeltaRequestSchema = z.object({
  jurisdiction: z.string().min(2),
  industry: z.string().optional(),
  since: z.string().datetime().optional(),
  source_priority: z.array(z.string()).optional(),
});

const ImpactRequestSchema = z.object({
  jurisdiction: z.string().min(2),
  rule_id: z.string(),
  control_framework: z.string().optional(),
});

const MapControlsRequestSchema = z.object({
  jurisdiction: z.string().min(2),
  industry: z.string(),
  control_framework: z.string(),
});

// Response schemas
const RuleDiffSchema = z.object({
  rule_id: z.string(),
  jurisdiction: z.string(),
  semantic_change_type: z.enum(['added', 'modified', 'removed', 'clarified']),
  diff_text: z.string(),
  effective_date: z.string().datetime(),
  urgency_score: z.number().min(0).max(10),
  source_url: z.string().url().optional(),
  freshness_timestamp: z.string().datetime(),
  confidence_score: z.number().min(0).max(1),
});

const DeltaResponseSchema = z.object({
  deltas: z.array(RuleDiffSchema),
  total_count: z.number(),
  freshness_timestamp: z.string().datetime(),
});

const ImpactResponseSchema = z.object({
  rule_id: z.string(),
  affected_controls: z.array(
    z.object({
      control_id: z.string(),
      control_name: z.string(),
      impact_level: z.enum(['high', 'medium', 'low']),
      remediation_required: z.boolean(),
    })
  ),
  freshness_timestamp: z.string().datetime(),
  confidence_score: z.number().min(0).max(1),
});

const MapControlsResponseSchema = z.object({
  mappings: z.array(
    z.object({
      regulation_id: z.string(),
      control_id: z.string(),
      mapping_confidence: z.number().min(0).max(1),
    })
  ),
  framework: z.string(),
  freshness_timestamp: z.string().datetime(),
});

const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

describe('Regulatory Delta API - Contract Tests', () => {
  describe('Request Schema Validation', () => {
    it('validates delta request with required fields', () => {
      const validRequest = {
        jurisdiction: 'US',
      };
      expect(() => DeltaRequestSchema.parse(validRequest)).not.toThrow();
    });

    it('validates delta request with all optional fields', () => {
      const validRequest = {
        jurisdiction: 'US',
        industry: 'finance',
        since: '2024-01-01T00:00:00Z',
        source_priority: ['federal', 'state'],
      };
      expect(() => DeltaRequestSchema.parse(validRequest)).not.toThrow();
    });

    it('rejects delta request with invalid jurisdiction', () => {
      const invalidRequest = {
        jurisdiction: 'X',
      };
      expect(() => DeltaRequestSchema.parse(invalidRequest)).toThrow();
    });

    it('validates impact request with required fields', () => {
      const validRequest = {
        jurisdiction: 'US',
        rule_id: 'SEC-2024-001',
      };
      expect(() => ImpactRequestSchema.parse(validRequest)).not.toThrow();
    });

    it('validates map-controls request with all required fields', () => {
      const validRequest = {
        jurisdiction: 'US',
        industry: 'finance',
        control_framework: 'SOC2',
      };
      expect(() => MapControlsRequestSchema.parse(validRequest)).not.toThrow();
    });
  });

  describe('Response Schema Validation', () => {
    it('validates delta response with complete data', () => {
      const validResponse = {
        deltas: [
          {
            rule_id: 'SEC-2024-001',
            jurisdiction: 'US',
            semantic_change_type: 'modified',
            diff_text: 'Updated disclosure requirements',
            effective_date: '2024-06-01T00:00:00Z',
            urgency_score: 7.5,
            source_url: 'https://sec.gov/rules/2024-001',
            freshness_timestamp: '2024-02-27T00:00:00Z',
            confidence_score: 0.95,
          },
        ],
        total_count: 1,
        freshness_timestamp: '2024-02-27T00:00:00Z',
      };
      expect(() => DeltaResponseSchema.parse(validResponse)).not.toThrow();
    });

    it('validates impact response with affected controls', () => {
      const validResponse = {
        rule_id: 'SEC-2024-001',
        affected_controls: [
          {
            control_id: 'SOC2-CC6.1',
            control_name: 'Logical Access Controls',
            impact_level: 'high',
            remediation_required: true,
          },
        ],
        freshness_timestamp: '2024-02-27T00:00:00Z',
        confidence_score: 0.92,
      };
      expect(() => ImpactResponseSchema.parse(validResponse)).not.toThrow();
    });

    it('validates map-controls response', () => {
      const validResponse = {
        mappings: [
          {
            regulation_id: 'SEC-2024-001',
            control_id: 'SOC2-CC6.1',
            mapping_confidence: 0.88,
          },
        ],
        framework: 'SOC2',
        freshness_timestamp: '2024-02-27T00:00:00Z',
      };
      expect(() => MapControlsResponseSchema.parse(validResponse)).not.toThrow();
    });

    it('rejects delta response with invalid urgency_score', () => {
      const invalidResponse = {
        deltas: [
          {
            rule_id: 'SEC-2024-001',
            jurisdiction: 'US',
            semantic_change_type: 'modified',
            diff_text: 'Updated disclosure requirements',
            effective_date: '2024-06-01T00:00:00Z',
            urgency_score: 15,
            freshness_timestamp: '2024-02-27T00:00:00Z',
            confidence_score: 0.95,
          },
        ],
        total_count: 1,
        freshness_timestamp: '2024-02-27T00:00:00Z',
      };
      expect(() => DeltaResponseSchema.parse(invalidResponse)).toThrow();
    });

    it('rejects impact response with invalid impact_level', () => {
      const invalidResponse = {
        rule_id: 'SEC-2024-001',
        affected_controls: [
          {
            control_id: 'SOC2-CC6.1',
            control_name: 'Logical Access Controls',
            impact_level: 'critical',
            remediation_required: true,
          },
        ],
        freshness_timestamp: '2024-02-27T00:00:00Z',
        confidence_score: 0.92,
      };
      expect(() => ImpactResponseSchema.parse(invalidResponse)).toThrow();
    });
  });

  describe('Error Response Schema Validation', () => {
    it('validates error response with required fields', () => {
      const validError = {
        error: {
          code: 'INVALID_JURISDICTION',
          message: 'Jurisdiction code not recognized',
        },
      };
      expect(() => ErrorResponseSchema.parse(validError)).not.toThrow();
    });

    it('validates error response with optional details', () => {
      const validError = {
        error: {
          code: 'PAYMENT_REQUIRED',
          message: 'Payment required for this endpoint',
          details: {
            price: '0.05',
            currency: 'USD',
          },
        },
      };
      expect(() => ErrorResponseSchema.parse(validError)).not.toThrow();
    });
  });

  describe('Freshness and Confidence Requirements', () => {
    it('ensures confidence_score is between 0 and 1', () => {
      const validConfidence = { confidence_score: 0.85 };
      const invalidLow = { confidence_score: -0.1 };
      const invalidHigh = { confidence_score: 1.5 };

      const ConfidenceSchema = z.object({
        confidence_score: z.number().min(0).max(1),
      });

      expect(() => ConfidenceSchema.parse(validConfidence)).not.toThrow();
      expect(() => ConfidenceSchema.parse(invalidLow)).toThrow();
      expect(() => ConfidenceSchema.parse(invalidHigh)).toThrow();
    });
  });
});

export {
  DeltaRequestSchema,
  ImpactRequestSchema,
  MapControlsRequestSchema,
  DeltaResponseSchema,
  ImpactResponseSchema,
  MapControlsResponseSchema,
  ErrorResponseSchema,
  RuleDiffSchema,
};
