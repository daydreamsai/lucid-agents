/**
 * Contracts Module
 *
 * Zod schemas for request/response validation and type safety.
 */

import { z } from 'zod';

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
  jurisdictions: z.array(z.string().length(2)).min(1),
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
