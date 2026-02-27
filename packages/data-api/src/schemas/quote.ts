import { z } from 'zod';
import { ChainSchema, UrgencySchema, TxTypeSchema, FreshnessMetadataSchema, ConfidenceSchema } from './common';

export const QuoteRequestSchema = z.object({
  chain: ChainSchema,
  urgency: UrgencySchema.default('medium'),
  tx_type: TxTypeSchema.default('transfer'),
  recent_failure_tolerance: z.number().min(0).max(1).default(0.05),
});
export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

export const QuoteResponseSchema = z.object({
  recommended_max_fee: z.string(),
  priority_fee: z.string(),
  estimated_cost_usd: z.number().optional(),
  urgency: UrgencySchema,
  chain: ChainSchema,
  freshness: FreshnessMetadataSchema,
  confidence: ConfidenceSchema,
});
export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;
