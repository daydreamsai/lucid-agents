import { z } from 'zod';

// Common schemas
export const AddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
export const NetworkSchema = z.string(); // Simplified to accept any string

export const FreshnessSchema = z.object({
  data_timestamp: z.string(),
  staleness_seconds: z.number().int().min(0),
});

export const ConfidenceSchema = z.number().min(0).max(1);

// POST /v1/risk/score
export const RiskScoreRequestSchema = z.object({
  address: AddressSchema,
  network: NetworkSchema,
  transaction_context: z
    .object({
      amount: z.string().optional(),
      currency: z.string().optional(),
    })
    .optional(),
  threshold: z.number().min(0).max(1).optional(),
  lookback_days: z.number().int().min(1).max(365).optional(),
});

export const RiskFactorSchema = z.object({
  factor: z.string(),
  weight: z.number().min(0).max(1),
  evidence: z.array(z.string()),
});

export const RiskScoreResponseSchema = z.object({
  risk_score: z.number().min(0).max(1),
  risk_factors: z.array(RiskFactorSchema),
  cluster_id: z.string().optional(),
  sanctions_proximity: z.number().int().min(0).optional(),
  evidence_refs: z.array(z.string()),
  freshness: FreshnessSchema,
  confidence: ConfidenceSchema,
});

// GET /v1/risk/exposure-paths
export const ExposurePathsRequestSchema = z.object({
  address: AddressSchema,
  network: NetworkSchema,
  max_depth: z.number().int().min(1).max(5).optional(),
  min_confidence: z.number().min(0).max(1).optional(),
});

export const ExposurePathSchema = z.object({
  path: z.array(AddressSchema),
  risk_score: z.number().min(0).max(1),
  confidence: ConfidenceSchema,
  evidence: z.array(z.string()),
});

export const ExposurePathsResponseSchema = z.object({
  paths: z.array(ExposurePathSchema),
  total_paths: z.number().int().min(0),
  freshness: FreshnessSchema,
});

// GET /v1/risk/entity-profile
export const EntityProfileRequestSchema = z.object({
  address: AddressSchema,
  network: NetworkSchema,
});

export const EntityProfileResponseSchema = z.object({
  address: AddressSchema,
  cluster_id: z.string().optional(),
  labels: z.array(z.string()),
  risk_indicators: z.object({
    sanctions_proximity: z.number().int().min(0),
    mixer_exposure: z.boolean(),
    high_risk_counterparties: z.number().int().min(0),
  }),
  transaction_stats: z.object({
    total_volume: z.string(),
    transaction_count: z.number().int().min(0),
    first_seen: z.string(),
    last_seen: z.string(),
  }),
  freshness: FreshnessSchema,
  confidence: ConfidenceSchema,
});

// Error response
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }),
});

// Type exports
export type RiskScoreRequest = z.infer<typeof RiskScoreRequestSchema>;
export type RiskScoreResponse = z.infer<typeof RiskScoreResponseSchema>;
export type ExposurePathsRequest = z.infer<typeof ExposurePathsRequestSchema>;
export type ExposurePathsResponse = z.infer<typeof ExposurePathsResponseSchema>;
export type EntityProfileRequest = z.infer<typeof EntityProfileRequestSchema>;
export type EntityProfileResponse = z.infer<typeof EntityProfileResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
