import { z } from 'zod';
import { ChainSchema, FreshnessMetadataSchema, ConfidenceSchema, MempoolVisibilitySchema } from './common';

export const CongestionRequestSchema = z.object({
  chain: ChainSchema,
});
export type CongestionRequest = z.infer<typeof CongestionRequestSchema>;

export const CongestionResponseSchema = z.object({
  chain: ChainSchema,
  congestion_state: z.enum(['low', 'moderate', 'high', 'extreme']),
  gas_utilization_pct: z.number().min(0).max(100),
  pending_tx_count: z.number().int().nonnegative(),
  base_fee: z.string(),
  base_fee_trend: z.enum(['rising', 'falling', 'stable']),
  recommended_action: z.enum(['proceed', 'wait', 'urgent_only']),
  mempool_visibility: MempoolVisibilitySchema,
  freshness: FreshnessMetadataSchema,
  confidence: ConfidenceSchema,
});
export type CongestionResponse = z.infer<typeof CongestionResponseSchema>;
