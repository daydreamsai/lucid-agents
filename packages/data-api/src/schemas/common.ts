import { z } from 'zod';

export const ChainSchema = z.enum([
  'ethereum', 'base', 'optimism', 'arbitrum', 'polygon',
]);
export type Chain = z.infer<typeof ChainSchema>;

export const UrgencySchema = z.enum(['low', 'medium', 'high', 'urgent']);
export type Urgency = z.infer<typeof UrgencySchema>;

export const TxTypeSchema = z.enum(['transfer', 'swap', 'contract_call', 'erc20_transfer']);
export type TxType = z.infer<typeof TxTypeSchema>;

export const URGENCY_BLOCK_TARGETS: Record<Urgency, number> = {
  low: 10,
  medium: 5,
  high: 3,
  urgent: 1,
};

export const URGENCY_TIP_PERCENTILES: Record<Urgency, number> = {
  low: 50,
  medium: 70,
  high: 90,
  urgent: 95,
};

export const FreshnessMetadataSchema = z.object({
  fetched_at: z.string().datetime(),
  block_number: z.number().int().positive(),
  block_age_ms: z.number().int().nonnegative(),
  stale: z.boolean(),
  data_source: z.enum(['live', 'cached', 'fallback']),
});
export type FreshnessMetadata = z.infer<typeof FreshnessMetadataSchema>;

export const ConfidenceSchema = z.object({
  score: z.number().min(0).max(1),
  factors: z.array(z.string()),
});
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const MempoolVisibilitySchema = z.enum(['full', 'partial', 'none']);
export type MempoolVisibility = z.infer<typeof MempoolVisibilitySchema>;
