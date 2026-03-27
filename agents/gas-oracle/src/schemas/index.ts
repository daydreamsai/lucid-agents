import { z } from 'zod';

// ─── Query Schemas ─────────────────────────────────────────────────────────────

export const UrgencyEnum = z.enum(['low', 'medium', 'high', 'urgent']);
export type Urgency = z.infer<typeof UrgencyEnum>;

export const GasQuoteQuerySchema = z.object({
  chain: z.string().min(1, 'chain is required'),
  urgency: UrgencyEnum.default('medium'),
  targetBlocks: z.coerce.number().int().positive().optional(),
  txType: z.enum(['legacy', 'eip1559', 'eip4844']).optional(),
});
export type GasQuoteQuery = z.infer<typeof GasQuoteQuerySchema>;

export const GasForecastQuerySchema = z.object({
  chain: z.string().min(1, 'chain is required'),
  horizonMinutes: z.coerce.number().int().positive().max(1440).default(60),
  granularity: z.coerce.number().int().positive().max(60).default(5),
});
export type GasForecastQuery = z.infer<typeof GasForecastQuerySchema>;

export const CongestionQuerySchema = z.object({
  chain: z.string().min(1, 'chain is required'),
});
export type CongestionQuery = z.infer<typeof CongestionQuerySchema>;

// ─── Response Schemas ──────────────────────────────────────────────────────────

export const InclusionProbabilityPointSchema = z.object({
  blocks: z.number().int().positive(),
  probability: z.number().min(0).max(1),
});
export type InclusionProbabilityPoint = z.infer<typeof InclusionProbabilityPointSchema>;

export const CongestionStateEnum = z.enum(['low', 'moderate', 'high', 'critical']);
export type CongestionState = z.infer<typeof CongestionStateEnum>;

export const GasQuoteResponseSchema = z.object({
  chain: z.string(),
  urgency: UrgencyEnum,
  recommended_max_fee: z.string(),   // wei as string to avoid BigInt serialisation issues
  priority_fee: z.string(),          // wei as string
  base_fee: z.string(),              // wei as string
  inclusion_probability_curve: z.array(InclusionProbabilityPointSchema),
  confidence_score: z.number().min(0).max(1),
  freshness_ms: z.number().nonnegative(),
  tx_type: z.enum(['legacy', 'eip1559', 'eip4844']).optional(),
  estimated_wait_seconds: z.number().optional(),
});
export type GasQuoteResponse = z.infer<typeof GasQuoteResponseSchema>;

export const ForecastPointSchema = z.object({
  timestamp_ms: z.number(),
  base_fee_gwei: z.number(),
  confidence_score: z.number().min(0).max(1),
});
export type ForecastPoint = z.infer<typeof ForecastPointSchema>;

export const GasForecastResponseSchema = z.object({
  chain: z.string(),
  horizon_minutes: z.number(),
  granularity_minutes: z.number(),
  forecast: z.array(ForecastPointSchema),
  confidence_score: z.number().min(0).max(1),
  freshness_ms: z.number().nonnegative(),
});
export type GasForecastResponse = z.infer<typeof GasForecastResponseSchema>;

export const CongestionResponseSchema = z.object({
  chain: z.string(),
  congestion_state: CongestionStateEnum,
  utilisation_percent: z.number().min(0).max(100),
  pending_tx_count: z.number().nonnegative(),
  base_fee_gwei: z.number().nonnegative(),
  confidence_score: z.number().min(0).max(1),
  freshness_ms: z.number().nonnegative(),
});
export type CongestionResponse = z.infer<typeof CongestionResponseSchema>;

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
