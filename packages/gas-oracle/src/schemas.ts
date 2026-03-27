import { z } from 'zod';

/**
 * Supported blockchain networks
 */
export const ChainSchema = z.enum([
  'ethereum',
  'base',
  'arbitrum',
  'optimism',
  'polygon',
]);
export type Chain = z.infer<typeof ChainSchema>;

/**
 * Transaction urgency levels
 */
export const UrgencySchema = z.enum(['low', 'medium', 'high', 'urgent']);
export type Urgency = z.infer<typeof UrgencySchema>;

/**
 * Transaction types
 */
export const TxTypeSchema = z.enum(['transfer', 'swap', 'contract']);
export type TxType = z.infer<typeof TxTypeSchema>;

/**
 * Congestion state
 */
export const CongestionStateSchema = z.enum(['low', 'moderate', 'high', 'severe']);
export type CongestionState = z.infer<typeof CongestionStateSchema>;

/**
 * Request schema for /v1/gas/quote
 */
export const GasQuoteRequestSchema = z.object({
  chain: ChainSchema,
  urgency: UrgencySchema.default('medium'),
  txType: TxTypeSchema.default('transfer'),
  recentFailureTolerance: z.number().min(0).max(1).default(0.05),
});
export type GasQuoteRequest = z.infer<typeof GasQuoteRequestSchema>;

/**
 * Inclusion probability curve point
 */
export const InclusionProbabilityPointSchema = z.object({
  blocks: z.number().int().positive(),
  probability: z.number().min(0).max(1),
});
export type InclusionProbabilityPoint = z.infer<typeof InclusionProbabilityPointSchema>;

/**
 * Response schema for /v1/gas/quote
 */
export const GasQuoteResponseSchema = z.object({
  recommended_max_fee: z.string(),
  priority_fee: z.string(),
  inclusion_probability_curve: z.array(InclusionProbabilityPointSchema),
  congestion_state: CongestionStateSchema,
  confidence_score: z.number().min(0).max(1),
  freshness_ms: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
});
export type GasQuoteResponse = z.infer<typeof GasQuoteResponseSchema>;

/**
 * Request schema for /v1/gas/forecast
 */
export const GasForecastRequestSchema = z.object({
  chain: ChainSchema,
  targetBlocks: z.number().int().positive().default(10),
});
export type GasForecastRequest = z.infer<typeof GasForecastRequestSchema>;

/**
 * Forecast data point
 */
export const ForecastPointSchema = z.object({
  block_offset: z.number().int().nonnegative(),
  estimated_base_fee: z.string(),
  estimated_priority_fee: z.string(),
  confidence: z.number().min(0).max(1),
});
export type ForecastPoint = z.infer<typeof ForecastPointSchema>;

/**
 * Response schema for /v1/gas/forecast
 */
export const GasForecastResponseSchema = z.object({
  chain: ChainSchema,
  current_block: z.number().int().positive(),
  forecast: z.array(ForecastPointSchema),
  freshness_ms: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
});
export type GasForecastResponse = z.infer<typeof GasForecastResponseSchema>;

/**
 * Request schema for /v1/gas/congestion
 */
export const GasCongestionRequestSchema = z.object({
  chain: ChainSchema,
});
export type GasCongestionRequest = z.infer<typeof GasCongestionRequestSchema>;

/**
 * Response schema for /v1/gas/congestion
 */
export const GasCongestionResponseSchema = z.object({
  chain: ChainSchema,
  congestion_state: CongestionStateSchema,
  pending_tx_count: z.number().int().nonnegative(),
  avg_block_utilization: z.number().min(0).max(1),
  base_fee_trend: z.enum(['rising', 'stable', 'falling']),
  freshness_ms: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
});
export type GasCongestionResponse = z.infer<typeof GasCongestionResponseSchema>;

/**
 * Error response schema
 */
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
  timestamp: z.string().datetime(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
