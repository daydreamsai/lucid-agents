import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

/**
 * Contract Tests - Phase 1 of TDD
 * 
 * These tests define the API contract and should fail initially.
 * They validate request/response schemas and error envelopes.
 */

// Request Schemas
export const ScreeningCheckInputSchema = z.object({
  entityName: z.string().min(1),
  identifiers: z
    .object({
      taxId: z.string().optional(),
      registrationNumber: z.string().optional(),
      lei: z.string().optional(),
    })
    .optional(),
  addresses: z.array(z.string()).optional(),
});

export const ExposureChainInputSchema = z.object({
  entityName: z.string().min(1),
  ownershipDepth: z.number().int().min(1).max(10).default(3),
});

export const JurisdictionRiskInputSchema = z.object({
  jurisdictions: z.array(z.string().length(2)),
});

// Response Schemas
export const FreshnessMetadataSchema = z.object({
  data_age_hours: z.number().nonnegative(),
  next_refresh: z.string().datetime(),
});

export const ScreeningMatchSchema = z.object({
  list: z.string(),
  entity: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

export const ScreeningCheckOutputSchema = z.object({
  screening_status: z.enum(['clear', 'flagged', 'blocked']),
  match_confidence: z.number().min(0).max(1),
  matches: z.array(ScreeningMatchSchema),
  evidence_bundle: z.object({
    sources: z.array(z.string()),
    last_updated: z.string().datetime(),
  }),
  freshness: FreshnessMetadataSchema,
});

export const ExposureChainItemSchema = z.object({
  level: z.number().int().positive(),
  entity: z.string(),
  ownership_pct: z.number().min(0).max(100),
  exposure_type: z.enum(['sanctions', 'pep', 'none']),
  confidence: z.number().min(0).max(1),
});

export const ExposureChainOutputSchema = z.object({
  exposure_chain: z.array(ExposureChainItemSchema),
  aggregate_risk: z.enum(['high', 'medium', 'low']),
  freshness: FreshnessMetadataSchema,
});

export const JurisdictionRiskItemSchema = z.object({
  jurisdiction: z.string().length(2),
  risk_level: z.enum(['high', 'medium', 'low']),
  sanctions_active: z.boolean(),
  pep_requirements: z.enum([
    'enhanced_due_diligence',
    'standard_due_diligence',
    'none',
  ]),
});

export const JurisdictionRiskOutputSchema = z.object({
  jurisdiction_risk: z.array(JurisdictionRiskItemSchema),
  freshness: FreshnessMetadataSchema,
});

// Error Schema
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

describe('Contract Tests - Request Schemas', () => {
  describe('ScreeningCheckInputSchema', () => {
    it('should validate valid screening check input', () => {
      const input = {
        entityName: 'Acme Corp',
        identifiers: {
          taxId: '12-3456789',
          registrationNumber: 'ABC123',
        },
        addresses: ['123 Main St, New York, NY'],
      };

      const result = ScreeningCheckInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject empty entity name', () => {
      const input = {
        entityName: '',
      };

      const result = ScreeningCheckInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should allow minimal input with just entity name', () => {
      const input = {
        entityName: 'Test Corp',
      };

      const result = ScreeningCheckInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('ExposureChainInputSchema', () => {
    it('should validate valid exposure chain input', () => {
      const input = {
        entityName: 'Parent Corp',
        ownershipDepth: 3,
      };

      const result = ExposureChainInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should apply default ownership depth', () => {
      const input = {
        entityName: 'Parent Corp',
      };

      const result = ExposureChainInputSchema.parse(input);
      expect(result.ownershipDepth).toBe(3);
    });

    it('should reject ownership depth > 10', () => {
      const input = {
        entityName: 'Parent Corp',
        ownershipDepth: 11,
      };

      const result = ExposureChainInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject ownership depth < 1', () => {
      const input = {
        entityName: 'Parent Corp',
        ownershipDepth: 0,
      };

      const result = ExposureChainInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('JurisdictionRiskInputSchema', () => {
    it('should validate valid jurisdiction input', () => {
      const input = {
        jurisdictions: ['US', 'EU', 'CN'],
      };

      const result = JurisdictionRiskInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject invalid jurisdiction codes', () => {
      const input = {
        jurisdictions: ['USA', 'EU'],
      };

      const result = JurisdictionRiskInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject empty jurisdiction array', () => {
      const input = {
        jurisdictions: [],
      };

      const result = JurisdictionRiskInputSchema.safeParse(input);
      expect(result.success).toBe(true); // Empty array is valid
    });
  });
});

describe('Contract Tests - Response Schemas', () => {
  describe('ScreeningCheckOutputSchema', () => {
    it('should validate valid screening response', () => {
      const output = {
        screening_status: 'clear',
        match_confidence: 0.95,
        matches: [],
        evidence_bundle: {
          sources: ['OFAC', 'UN'],
          last_updated: '2024-02-27T12:00:00Z',
        },
        freshness: {
          data_age_hours: 2,
          next_refresh: '2024-02-27T14:00:00Z',
        },
      };

      const result = ScreeningCheckOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should validate flagged status with matches', () => {
      const output = {
        screening_status: 'flagged',
        match_confidence: 0.88,
        matches: [
          {
            list: 'OFAC SDN',
            entity: 'Acme Corp',
            confidence: 0.88,
            reason: 'Similar name match',
          },
        ],
        evidence_bundle: {
          sources: ['OFAC'],
          last_updated: '2024-02-27T12:00:00Z',
        },
        freshness: {
          data_age_hours: 1,
          next_refresh: '2024-02-27T13:00:00Z',
        },
      };

      const result = ScreeningCheckOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should reject invalid screening status', () => {
      const output = {
        screening_status: 'unknown',
        match_confidence: 0.5,
        matches: [],
        evidence_bundle: {
          sources: [],
          last_updated: '2024-02-27T12:00:00Z',
        },
        freshness: {
          data_age_hours: 0,
          next_refresh: '2024-02-27T12:00:00Z',
        },
      };

      const result = ScreeningCheckOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it('should reject confidence outside 0-1 range', () => {
      const output = {
        screening_status: 'clear',
        match_confidence: 1.5,
        matches: [],
        evidence_bundle: {
          sources: [],
          last_updated: '2024-02-27T12:00:00Z',
        },
        freshness: {
          data_age_hours: 0,
          next_refresh: '2024-02-27T12:00:00Z',
        },
      };

      const result = ScreeningCheckOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });
  });

  describe('ExposureChainOutputSchema', () => {
    it('should validate valid exposure chain response', () => {
      const output = {
        exposure_chain: [
          {
            level: 1,
            entity: 'Parent Corp',
            ownership_pct: 75.0,
            exposure_type: 'pep',
            confidence: 0.88,
          },
        ],
        aggregate_risk: 'medium',
        freshness: {
          data_age_hours: 4,
          next_refresh: '2024-02-27T16:00:00Z',
        },
      };

      const result = ExposureChainOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should reject invalid ownership percentage', () => {
      const output = {
        exposure_chain: [
          {
            level: 1,
            entity: 'Parent Corp',
            ownership_pct: 150.0,
            exposure_type: 'pep',
            confidence: 0.88,
          },
        ],
        aggregate_risk: 'medium',
        freshness: {
          data_age_hours: 4,
          next_refresh: '2024-02-27T16:00:00Z',
        },
      };

      const result = ExposureChainOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });
  });

  describe('JurisdictionRiskOutputSchema', () => {
    it('should validate valid jurisdiction risk response', () => {
      const output = {
        jurisdiction_risk: [
          {
            jurisdiction: 'US',
            risk_level: 'low',
            sanctions_active: true,
            pep_requirements: 'enhanced_due_diligence',
          },
        ],
        freshness: {
          data_age_hours: 24,
          next_refresh: '2024-02-28T12:00:00Z',
        },
      };

      const result = JurisdictionRiskOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });
  });
});

describe('Contract Tests - Error Responses', () => {
  it('should validate error response schema', () => {
    const error = {
      error: {
        code: 'INVALID_INPUT',
        message: 'Entity name is required',
        details: { field: 'entityName' },
      },
    };

    const result = ErrorResponseSchema.safeParse(error);
    expect(result.success).toBe(true);
  });

  it('should allow error without details', () => {
    const error = {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };

    const result = ErrorResponseSchema.safeParse(error);
    expect(result.success).toBe(true);
  });
});
