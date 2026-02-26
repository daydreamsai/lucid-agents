/**
 * Geo Demand Pulse Index - Zod Schemas
 *
 * Strict contract definitions for all request/response shapes.
 * These schemas are the source of truth for API validation.
 */
import { z } from 'zod';

// ============================================================================
// Common Types
// ============================================================================

export const GeoTypeSchema = z.enum(['zip', 'city', 'county', 'state', 'metro']);
export type GeoType = z.infer<typeof GeoTypeSchema>;

export const SeasonalityModeSchema = z.enum(['none', 'yoy', 'mom', 'auto']);
export type SeasonalityMode = z.infer<typeof SeasonalityModeSchema>;

export const LookbackWindowSchema = z.enum(['7d', '30d', '90d', '365d']);
export type LookbackWindow = z.infer<typeof LookbackWindowSchema>;

export const CategorySchema = z.string().min(1).max(100);

export const ConfidenceIntervalSchema = z.object({
  lower: z.number(),
  upper: z.number(),
  level: z.number().min(0).max(1),
});
export type ConfidenceInterval = z.infer<typeof ConfidenceIntervalSchema>;

export const FreshnessMetadataSchema = z.object({
  dataAsOf: z.string().datetime(),
  computedAt: z.string().datetime(),
  staleAfter: z.string().datetime(),
  ttlSeconds: z.number().int().positive(),
});
export type FreshnessMetadata = z.infer<typeof FreshnessMetadataSchema>;

// ============================================================================
// Demand Index Endpoint
// ============================================================================

export const DemandIndexInputSchema = z.object({
  geoType: GeoTypeSchema,
  geoCode: z.string().min(1).max(50),
  category: CategorySchema.optional(),
  lookbackWindow: LookbackWindowSchema.default('30d'),
  seasonalityMode: SeasonalityModeSchema.default('auto'),
});
export type DemandIndexInput = z.infer<typeof DemandIndexInputSchema>;

export const DemandIndexOutputSchema = z.object({
  geoType: GeoTypeSchema,
  geoCode: z.string(),
  category: z.string().nullable(),
  demandIndex: z.number().min(0).max(200),
  velocity: z.number(),
  confidenceInterval: ConfidenceIntervalSchema,
  comparableGeos: z.array(
    z.object({
      geoCode: z.string(),
      demandIndex: z.number(),
      similarity: z.number().min(0).max(1),
    })
  ),
  freshness: FreshnessMetadataSchema,
});
export type DemandIndexOutput = z.infer<typeof DemandIndexOutputSchema>;

// ============================================================================
// Trend Endpoint
// ============================================================================

export const TrendInputSchema = z.object({
  geoType: GeoTypeSchema,
  geoCode: z.string().min(1).max(50),
  category: CategorySchema.optional(),
  lookbackWindow: LookbackWindowSchema.default('30d'),
  granularity: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
});
export type TrendInput = z.infer<typeof TrendInputSchema>;

export const TrendDataPointSchema = z.object({
  date: z.string().datetime(),
  demandIndex: z.number(),
  velocity: z.number(),
});
export type TrendDataPoint = z.infer<typeof TrendDataPointSchema>;

export const TrendOutputSchema = z.object({
  geoType: GeoTypeSchema,
  geoCode: z.string(),
  category: z.string().nullable(),
  trendDirection: z.enum(['rising', 'falling', 'stable']),
  trendStrength: z.number().min(0).max(1),
  dataPoints: z.array(TrendDataPointSchema),
  confidenceInterval: ConfidenceIntervalSchema,
  freshness: FreshnessMetadataSchema,
});
export type TrendOutput = z.infer<typeof TrendOutputSchema>;

// ============================================================================
// Anomalies Endpoint
// ============================================================================

export const AnomaliesInputSchema = z.object({
  geoType: GeoTypeSchema,
  geoCode: z.string().min(1).max(50),
  category: CategorySchema.optional(),
  lookbackWindow: LookbackWindowSchema.default('30d'),
  sensitivityThreshold: z.number().min(1).max(5).default(2),
});
export type AnomaliesInput = z.infer<typeof AnomaliesInputSchema>;

export const AnomalyFlagSchema = z.object({
  type: z.enum(['spike', 'drop', 'volatility', 'trend_break']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  detectedAt: z.string().datetime(),
  description: z.string(),
  affectedMetric: z.string(),
  deviationScore: z.number(),
});
export type AnomalyFlag = z.infer<typeof AnomalyFlagSchema>;

export const AnomaliesOutputSchema = z.object({
  geoType: GeoTypeSchema,
  geoCode: z.string(),
  category: z.string().nullable(),
  anomalyFlags: z.array(AnomalyFlagSchema),
  anomalyCount: z.number().int().nonnegative(),
  baselineStats: z.object({
    mean: z.number(),
    stdDev: z.number(),
    median: z.number(),
  }),
  freshness: FreshnessMetadataSchema,
});
export type AnomaliesOutput = z.infer<typeof AnomaliesOutputSchema>;

// ============================================================================
// Error Envelope
// ============================================================================

export const ErrorCodeSchema = z.enum([
  'INVALID_GEO_CODE',
  'INVALID_GEO_TYPE',
  'INVALID_CATEGORY',
  'INVALID_LOOKBACK_WINDOW',
  'DATA_NOT_AVAILABLE',
  'DATA_STALE',
  'RATE_LIMITED',
  'PAYMENT_REQUIRED',
  'INTERNAL_ERROR',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
    retryAfter: z.number().int().positive().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
