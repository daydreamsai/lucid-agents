import { z } from 'zod';

// Request schemas
export const GeoTypeSchema = z.enum(['zip', 'city', 'region']);
export const LookbackWindowSchema = z.enum(['7d', '30d', '90d']).default('30d');
export const SeasonalityModeSchema = z.enum(['raw', 'adjusted']).default('adjusted');

export const DemandIndexRequestSchema = z.object({
  geoType: GeoTypeSchema,
  geoCode: z.string().min(1),
  category: z.string().optional(),
  lookbackWindow: LookbackWindowSchema.optional(),
  seasonalityMode: SeasonalityModeSchema.optional(),
});

export const DemandTrendRequestSchema = z.object({
  geoType: GeoTypeSchema,
  geoCode: z.string().min(1),
  category: z.string().optional(),
  lookbackWindow: LookbackWindowSchema.optional(),
});

export const DemandAnomaliesRequestSchema = z.object({
  geoType: GeoTypeSchema,
  geoCode: z.string().min(1),
  category: z.string().optional(),
  lookbackWindow: LookbackWindowSchema.optional(),
});

// Response schemas
export const FreshnessSchema = z.object({
  generated_at: z.string().datetime(),
  staleness_ms: z.number().int().nonnegative(),
  sla_status: z.enum(['fresh', 'stale', 'expired']),
});

export const ConfidenceIntervalSchema = z.object({
  lower: z.number(),
  upper: z.number(),
});

export const DemandIndexResponseSchema = z.object({
  demand_index: z.number().min(0).max(100),
  velocity: z.number(),
  confidence_interval: ConfidenceIntervalSchema,
  anomaly_flags: z.array(z.string()),
  comparable_geos: z.array(z.string()),
  freshness: FreshnessSchema,
  confidence: z.number().min(0).max(1),
});

export const DemandTrendResponseSchema = z.object({
  velocity: z.number(),
  acceleration: z.number(),
  trend_direction: z.enum(['rising', 'falling', 'stable']),
  momentum_score: z.number().min(0).max(100),
  historical_points: z.array(z.object({
    timestamp: z.string().datetime(),
    value: z.number(),
  })),
  freshness: FreshnessSchema,
  confidence: z.number().min(0).max(1),
});

export const AnomalySchema = z.object({
  type: z.enum(['spike', 'drop', 'volatility', 'seasonal_deviation']),
  severity: z.enum(['low', 'medium', 'high']),
  detected_at: z.string().datetime(),
  description: z.string(),
  expected_value: z.number(),
  actual_value: z.number(),
  deviation_percent: z.number(),
});

export const DemandAnomaliesResponseSchema = z.object({
  anomalies: z.array(AnomalySchema),
  anomaly_score: z.number().min(0).max(100),
  baseline_demand: z.number(),
  current_demand: z.number(),
  freshness: FreshnessSchema,
  confidence: z.number().min(0).max(1),
});

// Error schema
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});

// Type exports
export type GeoType = z.infer<typeof GeoTypeSchema>;
export type DemandIndexRequest = z.infer<typeof DemandIndexRequestSchema>;
export type DemandIndexResponse = z.infer<typeof DemandIndexResponseSchema>;
export type DemandTrendRequest = z.infer<typeof DemandTrendRequestSchema>;
export type DemandTrendResponse = z.infer<typeof DemandTrendResponseSchema>;
export type DemandAnomaliesRequest = z.infer<typeof DemandAnomaliesRequestSchema>;
export type DemandAnomaliesResponse = z.infer<typeof DemandAnomaliesResponseSchema>;
export type Freshness = z.infer<typeof FreshnessSchema>;
export type Anomaly = z.infer<typeof AnomalySchema>;
