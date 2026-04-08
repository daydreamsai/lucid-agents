import { z } from 'zod';

export const ScreeningCheckRequestSchema = z.object({
  entityName: z.string().min(1),
  identifiers: z.array(z.object({ type: z.string(), value: z.string() })).optional(),
  addresses: z.array(z.object({ country: z.string(), city: z.string().optional() })).optional(),
  ownershipDepth: z.number().int().min(1).max(5).default(2),
});

export const ExposureChainRequestSchema = z.object({
  entityName: z.string().min(1),
  identifiers: z.array(z.object({ type: z.string(), value: z.string() })).optional(),
  ownershipDepth: z.number().int().min(1).max(5).default(3),
});

export const JurisdictionRiskRequestSchema = z.object({
  jurisdictions: z.array(z.string().length(2)).min(1),
  entityName: z.string().optional(),
});

export const FreshnessSchema = z.object({
  generated_at: z.string().datetime(),
  staleness_ms: z.number().int().nonnegative(),
  sla_status: z.enum(['fresh', 'stale', 'expired']),
});

export const MatchSchema = z.object({
  list_name: z.string(),
  list_type: z.enum(['sanctions', 'pep', 'watchlist', 'adverse_media']),
  match_score: z.number().min(0).max(100),
  matched_name: z.string(),
  matched_fields: z.array(z.string()),
  source_url: z.string().url().optional(),
});

export const ScreeningCheckResponseSchema = z.object({
  screening_status: z.enum(['clear', 'potential_match', 'confirmed_match', 'error']),
  match_confidence: z.number().min(0).max(100),
  matches: z.array(MatchSchema),
  evidence_bundle: z.array(z.string().url()),
  freshness: FreshnessSchema,
  confidence: z.number().min(0).max(1),
});

export const ExposureNodeSchema = z.object({
  entity_name: z.string(),
  entity_type: z.enum(['individual', 'company', 'trust', 'government']),
  ownership_percent: z.number().min(0).max(100).optional(),
  risk_flags: z.array(z.string()),
  jurisdiction: z.string(),
});

export const ExposureChainResponseSchema = z.object({
  exposure_chain: z.array(ExposureNodeSchema),
  total_risk_score: z.number().min(0).max(100),
  high_risk_entities: z.number().int().nonnegative(),
  sanctioned_jurisdictions: z.array(z.string()),
  evidence_bundle: z.array(z.string().url()),
  freshness: FreshnessSchema,
  confidence: z.number().min(0).max(1),
});

export const JurisdictionRiskResponseSchema = z.object({
  jurisdiction_risk: z.array(z.object({
    jurisdiction: z.string(),
    risk_level: z.enum(['low', 'medium', 'high', 'very_high', 'prohibited']),
    risk_score: z.number().min(0).max(100),
    sanctions_programs: z.array(z.string()),
    fatf_status: z.enum(['compliant', 'grey_list', 'black_list', 'unknown']).optional(),
  })),
  overall_risk: z.enum(['low', 'medium', 'high', 'very_high', 'prohibited']),
  freshness: FreshnessSchema,
  confidence: z.number().min(0).max(1),
});

export type ScreeningCheckRequest = z.infer<typeof ScreeningCheckRequestSchema>;
export type ScreeningCheckResponse = z.infer<typeof ScreeningCheckResponseSchema>;
export type ExposureChainRequest = z.infer<typeof ExposureChainRequestSchema>;
export type ExposureChainResponse = z.infer<typeof ExposureChainResponseSchema>;
export type JurisdictionRiskRequest = z.infer<typeof JurisdictionRiskRequestSchema>;
export type JurisdictionRiskResponse = z.infer<typeof JurisdictionRiskResponseSchema>;
export type Freshness = z.infer<typeof FreshnessSchema>;
export type Match = z.infer<typeof MatchSchema>;
export type ExposureNode = z.infer<typeof ExposureNodeSchema>;
