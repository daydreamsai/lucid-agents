import { z } from 'zod';

// Request schemas
export const ReputationRequestSchema = z.object({
  agentAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  chain: z.string().regex(/^eip155:\d+$/, 'Invalid chain format'),
  timeframe: z.string().optional(),
  evidenceDepth: z.enum(['minimal', 'standard', 'full']).optional(),
});

export const HistoryRequestSchema = z.object({
  agentAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  chain: z.string().regex(/^eip155:\d+$/, 'Invalid chain format'),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
  evidenceDepth: z.enum(['minimal', 'standard', 'full']).optional(),
});

export const TrustBreakdownRequestSchema = z.object({
  agentAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  chain: z.string().regex(/^eip155:\d+$/, 'Invalid chain format'),
});

// Response schemas
export const FreshnessSchema = z.object({
  timestamp: z.string().datetime(),
  age_seconds: z.number().int().min(0),
});

export const OnchainIdentityStateSchema = z.object({
  agentId: z.string(),
  owner: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  registered: z.boolean(),
  metadata: z.record(z.string(), z.any()).optional(),
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
  type: z.enum(['feedback', 'validation', 'dispute', 'completion']),
  timestamp: z.string().datetime(),
  from: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  value: z.number().optional(),
  evidence_url: z.string().url().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const HistoryResponseSchema = z.object({
  events: z.array(HistoryEventSchema),
  total_count: z.number().int().min(0),
  freshness: FreshnessSchema,
});

export const TrustBreakdownResponseSchema = z.object({
  components: z.object({
    onchain_reputation: z.number().min(0).max(100),
    completion_history: z.number().min(0).max(100),
    dispute_resolution: z.number().min(0).max(100),
    peer_endorsements: z.number().min(0).max(100),
  }),
  weights: z.object({
    onchain_reputation: z.number().min(0).max(1),
    completion_history: z.number().min(0).max(1),
    dispute_resolution: z.number().min(0).max(1),
    peer_endorsements: z.number().min(0).max(1),
  }),
  overall_score: z.number().min(0).max(100),
  freshness: FreshnessSchema,
  confidence: z.number().min(0).max(1),
});

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }),
});

// Type exports
export type ReputationRequest = z.infer<typeof ReputationRequestSchema>;
export type ReputationResponse = z.infer<typeof ReputationResponseSchema>;
export type HistoryRequest = z.infer<typeof HistoryRequestSchema>;
export type HistoryResponse = z.infer<typeof HistoryResponseSchema>;
export type TrustBreakdownRequest = z.infer<typeof TrustBreakdownRequestSchema>;
export type TrustBreakdownResponse = z.infer<typeof TrustBreakdownResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
