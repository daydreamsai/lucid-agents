import { z } from 'zod';

// ============================================================================
// Sanctions & PEP Exposure Intelligence API - Schema Definitions
// ============================================================================

// --- Enums ---
export const ScreeningStatusSchema = z.enum([
  'clear',
  'potential_match',
  'confirmed_match',
  'escalate',
]);

export const MatchConfidenceSchema = z.enum(['low', 'medium', 'high', 'exact']);

export const RiskLevelSchema = z.enum([
  'minimal',
  'low',
  'medium',
  'high',
  'critical',
]);

export const EntityTypeSchema = z.enum([
  'individual',
  'organization',
  'vessel',
  'aircraft',
]);

export const SanctionsListSchema = z.enum([
  'OFAC_SDN',
  'OFAC_CONS',
  'EU_SANCTIONS',
  'UN_SANCTIONS',
  'UK_SANCTIONS',
  'AU_SANCTIONS',
]);

export const PEPCategorySchema = z.enum([
  'head_of_state',
  'government_minister',
  'senior_official',
  'judicial',
  'military',
  'state_enterprise',
  'international_org',
  'family_member',
  'close_associate',
]);

// --- Common Schemas ---
export const FreshnessSchema = z.object({
  generated_at: z.string().datetime(),
  staleness_ms: z.number().int().nonnegative(),
  sla_status: z.enum(['fresh', 'stale', 'expired']),
  data_source_updated_at: z.string().datetime().optional(),
});

export const IdentifierSchema = z.object({
  type: z.enum([
    'passport',
    'national_id',
    'tax_id',
    'company_reg',
    'lei',
    'swift_bic',
    'wallet_address',
  ]),
  value: z.string(),
  country: z.string().length(2).optional(),
});

export const AddressSchema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  postal_code: z.string().optional(),
  country: z.string().length(2),
});

// --- Request Schemas ---
export const ScreeningCheckRequestSchema = z.object({
  entity_name: z.string().min(1).max(500),
  entity_type: EntityTypeSchema.default('individual'),
  identifiers: z.array(IdentifierSchema).optional(),
  addresses: z.array(AddressSchema).optional(),
  date_of_birth: z.string().optional(),
  nationality: z.string().length(2).optional(),
  include_pep: z.boolean().default(true),
  include_sanctions: z.boolean().default(true),
  fuzzy_threshold: z.number().min(0).max(1).default(0.85),
});

export const ExposureChainRequestSchema = z.object({
  entity_name: z.string().min(1).max(500),
  entity_type: EntityTypeSchema.default('organization'),
  ownership_depth: z.number().int().min(1).max(5).default(3),
  include_indirect: z.boolean().default(true),
});

export const JurisdictionRiskRequestSchema = z.object({
  jurisdictions: z.array(z.string().length(2)).min(1).max(50),
  include_sanctions_programs: z.boolean().default(true),
  include_fatf_status: z.boolean().default(true),
});

// --- Response Schemas ---
export const SanctionsMatchSchema = z.object({
  list_source: SanctionsListSchema,
  list_entry_id: z.string(),
  matched_name: z.string(),
  match_score: z.number().min(0).max(1),
  match_type: z.enum(['exact', 'alias', 'fuzzy']),
  sanctions_programs: z.array(z.string()),
  listing_date: z.string().datetime().optional(),
  reason: z.string().optional(),
});

export const PEPMatchSchema = z.object({
  pep_id: z.string(),
  matched_name: z.string(),
  match_score: z.number().min(0).max(1),
  category: PEPCategorySchema,
  position: z.string(),
  country: z.string().length(2),
  active: z.boolean(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

export const EvidenceBundleSchema = z.object({
  sanctions_matches: z.array(SanctionsMatchSchema),
  pep_matches: z.array(PEPMatchSchema),
  adverse_media_count: z.number().int().nonnegative(),
  data_sources_checked: z.array(z.string()),
  search_parameters_used: z.record(z.string(), z.unknown()),
});

export const ScreeningCheckResponseSchema = z.object({
  screening_status: ScreeningStatusSchema,
  match_confidence: MatchConfidenceSchema,
  risk_score: z.number().min(0).max(100),
  evidence_bundle: EvidenceBundleSchema,
  rationale: z.string(),
  recommended_action: z.enum([
    'auto_approve',
    'manual_review',
    'escalate',
    'reject',
  ]),
  freshness: FreshnessSchema,
  confidence: z.number().min(0).max(1),
});

export const OwnershipNodeSchema = z.object({
  entity_id: z.string(),
  entity_name: z.string(),
  entity_type: EntityTypeSchema,
  ownership_percentage: z.number().min(0).max(100).optional(),
  control_type: z.enum(['direct', 'indirect', 'beneficial']).optional(),
  jurisdiction: z.string().length(2),
  risk_flags: z.array(z.string()),
  sanctions_exposure: z.boolean(),
  pep_exposure: z.boolean(),
});

export const ExposureChainResponseSchema = z.object({
  root_entity: z.string(),
  ownership_chain: z.array(OwnershipNodeSchema),
  total_depth_analyzed: z.number().int(),
  high_risk_paths: z.array(
    z.object({
      path: z.array(z.string()),
      risk_reason: z.string(),
      risk_level: RiskLevelSchema,
    })
  ),
  aggregate_exposure: z.object({
    sanctions_exposed_entities: z.number().int().nonnegative(),
    pep_exposed_entities: z.number().int().nonnegative(),
    high_risk_jurisdictions: z.array(z.string()),
  }),
  freshness: FreshnessSchema,
  confidence: z.number().min(0).max(1),
});

export const JurisdictionRiskEntrySchema = z.object({
  jurisdiction: z.string().length(2),
  jurisdiction_name: z.string(),
  overall_risk: RiskLevelSchema,
  sanctions_programs_active: z.array(z.string()),
  fatf_status: z
    .enum(['member', 'grey_list', 'black_list', 'not_evaluated'])
    .optional(),
  cpi_score: z.number().min(0).max(100).optional(),
  risk_factors: z.array(z.string()),
});

export const JurisdictionRiskResponseSchema = z.object({
  jurisdiction_risks: z.array(JurisdictionRiskEntrySchema),
  high_risk_count: z.number().int().nonnegative(),
  freshness: FreshnessSchema,
  confidence: z.number().min(0).max(1),
});

// --- Error Schema ---
export const ErrorResponseSchema = z.object({
  error_code: z.enum([
    'INVALID_INPUT',
    'ENTITY_NOT_FOUND',
    'RATE_LIMITED',
    'UPSTREAM_ERROR',
    'PAYMENT_REQUIRED',
    'INTERNAL_ERROR',
  ]),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
  request_id: z.string(),
});

// --- Type Exports ---
export type ScreeningStatus = z.infer<typeof ScreeningStatusSchema>;
export type MatchConfidence = z.infer<typeof MatchConfidenceSchema>;
export type RiskLevel = z.infer<typeof RiskLevelSchema>;
export type EntityType = z.infer<typeof EntityTypeSchema>;
export type SanctionsList = z.infer<typeof SanctionsListSchema>;
export type PEPCategory = z.infer<typeof PEPCategorySchema>;
export type Freshness = z.infer<typeof FreshnessSchema>;
export type Identifier = z.infer<typeof IdentifierSchema>;
export type Address = z.infer<typeof AddressSchema>;
export type ScreeningCheckRequest = z.infer<typeof ScreeningCheckRequestSchema>;
export type ExposureChainRequest = z.infer<typeof ExposureChainRequestSchema>;
export type JurisdictionRiskRequest = z.infer<typeof JurisdictionRiskRequestSchema>;
export type SanctionsMatch = z.infer<typeof SanctionsMatchSchema>;
export type PEPMatch = z.infer<typeof PEPMatchSchema>;
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;
export type ScreeningCheckResponse = z.infer<typeof ScreeningCheckResponseSchema>;
export type OwnershipNode = z.infer<typeof OwnershipNodeSchema>;
export type ExposureChainResponse = z.infer<typeof ExposureChainResponseSchema>;
export type JurisdictionRiskEntry = z.infer<typeof JurisdictionRiskEntrySchema>;
export type JurisdictionRiskResponse = z.infer<typeof JurisdictionRiskResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
