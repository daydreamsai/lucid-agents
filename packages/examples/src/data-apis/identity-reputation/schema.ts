import { z } from 'zod';

export const ChainSchema = z.string().regex(/^eip155:\d+$/, 'Invalid chain format');
export const TimeframeSchema = z.enum(['7d', '30d', '90d', 'all']).default('30d');
export const EvidenceDepthSchema = z.number().int().min(1).max(5).default(3);

export const ReputationRequestSchema = z.object({
  agentAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address'),
  chain: ChainSchema,
  timeframe: TimeframeSchema.optional(),
  evidenceDepth: EvidenceDepthSchema.optional(),
});

export const HistoryRequestSchema = z.object({
  agentAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address'),
  chain: ChainSchema,
  timeframe: TimeframeSchema.optional(),
});

export const TrustBreakdownRequestSchema = z.object({
  agentAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address'),
  chain: ChainSchema,
  evidenceDepth: EvidenceDepthSchema.optional(),
});

export const FreshnessSchema = z.object({
  generated_at: z.string().datetime(),
  staleness_ms: z.number().int().nonnegative(),
  sla_status: z.enum(['fresh', 'stale', 'expired']),
});

export const OnchainIdentityStateSchema = z.object({
  registered: z.boolean(),
  verified: z.boolean(),
  metadata_uri: z.string().nullable(),
  registration_block: z.number().int().optional(),
  last_update_block: z.number().int().optional(),
});

export const ReputationResponseSchema = z.object({
  trust_score: z.number().min(0).max(100),
  completion_rate: z.number().min(0).max(1),
  dispute_rate: z.number().min(0).max(1),
  onchain_identity_state: OnchainIdentityStateSchema,
  evidence_urls: z.array(z.string().url()),
  freshness: FreshnessSchema,
  confidence: z.number().min(0).max(1),
});

export const HistoryEventSchema = z.object({
  event_type: z.enum(['task_completed', 'task_failed', 'dispute_opened', 'dispute_resolved', 'payment_received', 'payment_sent']),
  timestamp: z.string().datetime(),
  counterparty: z.string().optional(),
  amount_usd: z.number().optional(),
  tx_hash: z.string().optional(),
  outcome: z.enum(['success', 'failure', 'pending']).optional(),
});

export const HistoryResponseSchema = z.object({
  events: z.array(HistoryEventSchema),
  total_tasks: z.number().int().nonnegative(),
  successful_tasks: z.number().int().nonnegative(),
  total_volume_usd: z.number().nonnegative(),
  active_since: z.string().datetime(),
  freshness: FreshnessSchema,
  confidence: z.number().min(0).max(1),
});

export const TrustComponentSchema = z.object({
  component: z.enum(['completion_history', 'dispute_record', 'payment_reliability', 'peer_attestations', 'onchain_activity']),
  score: z.number().min(0).max(100),
  weight: z.number().min(0).max(1),
  evidence_count: z.number().int().nonnegative(),
  description: z.string(),
});

export const TrustBreakdownResponseSchema = z.object({
  overall_score: z.number().min(0).max(100),
  components: z.array(TrustComponentSchema),
  risk_flags: z.array(z.string()),
  recommendations: z.array(z.string()),
  evidence_urls: z.array(z.string().url()),
  freshness: FreshnessSchema,
  confidence: z.number().min(0).max(1),
});

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});

export type ReputationRequest = z.infer<typeof ReputationRequestSchema>;
export type ReputationResponse = z.infer<typeof ReputationResponseSchema>;
export type HistoryRequest = z.infer<typeof HistoryRequestSchema>;
export type HistoryResponse = z.infer<typeof HistoryResponseSchema>;
export type HistoryEvent = z.infer<typeof HistoryEventSchema>;
export type TrustBreakdownRequest = z.infer<typeof TrustBreakdownRequestSchema>;
export type TrustBreakdownResponse = z.infer<typeof TrustBreakdownResponseSchema>;
export type TrustComponent = z.infer<typeof TrustComponentSchema>;
export type OnchainIdentityState = z.infer<typeof OnchainIdentityStateSchema>;
export type Freshness = z.infer<typeof FreshnessSchema>;
