import { z } from 'zod';
import { ChainSchema, FreshnessMetadataSchema, ConfidenceSchema } from './common';

export const ForecastRequestSchema = z.object({
  chain: ChainSchema,
  target_blocks: z.number().int().min(1).max(200).default(10),
});
export type ForecastRequest = z.infer<typeof ForecastRequestSchema>;

export const InclusionPointSchema = z.object({
  max_fee: z.string(),
  priority_fee: z.string(),
  inclusion_probability: z.number().min(0).max(1),
  target_block: z.number().int().positive(),
});
export type InclusionPoint = z.infer<typeof InclusionPointSchema>;

export const ForecastResponseSchema = z.object({
  chain: ChainSchema,
  inclusion_probability_curve: z.array(InclusionPointSchema).min(1),
  forecast_horizon_blocks: z.number().int().positive(),
  trend: z.enum(['rising', 'falling', 'stable']),
  freshness: FreshnessMetadataSchema,
  confidence: ConfidenceSchema,
});
export type ForecastResponse = z.infer<typeof ForecastResponseSchema>;
