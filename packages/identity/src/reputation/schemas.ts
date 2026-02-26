import { z } from 'zod';

// ============================================================================
// Request Schemas
// ============================================================================

export const ChainSchema = z.enum([
  'ethereum',
  'base',
  'optimism',
  'arbitrum',
  'polygon',
]);
export type Chain = z.infer<typeof ChainSchema>;

export const TimeframeSchema = z.enum(['24h', '7d', '30d', '90d', '1y', 'all']);
export type Timeframe = z.infer<typeof TimeframeSchema>;

export const EvidenceDepthSchema = z.enum(['minimal', 'standard', 'full']);
export type EvidenceDepth = z.infer<typeof EvidenceDepthSchema>;

export const ReputationRequestSchema = z.object({
  agentAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  chain: ChainSchema.default('base'),
  timeframe: TimeframeSchema.default('30d'),
  evidenceDepth: EvidenceDepthSchema.default('standard'),
});
export type ReputationRequest = z.infer<typeof ReputationRequestSchema>;

export const HistoryRequestSchema = z.object({
  agentAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  chain: ChainSchema.default('base'),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});
export type HistoryRequest = z.infer<typeof HistoryRequestSchema>;

export const TrustBreakdownRequestSchema = z.object({
  agentAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  chain: ChainSchema.default('base'),
  timeframe: TimeframeSchema.default('30d'),
});
export type TrustBreakdownRequest = z.infer<typeof TrustBreakdownRequestSchema>;

// ============================================================================
// Response Schemas
// ============================================================================

export const FreshnessMetadataSchema = z.object({
  lastUpdated: z.string().datetime(),
  dataAge: z.number().int().min(0).describe('Age in seconds'),
  nextRefresh: z.string().datetime().optional(),
  source: z.enum(['onchain', 'cache', 'aggregated']),
});
export type FreshnessMetadata = z.infer<typeof FreshnessMetadataSchema>;

export const ConfidenceAnnotationSchema = z.object({
  level: z.enum(['high', 'medium', 'low']),
  score: z.number().min(0).max(1),
  factors: z.array(z.string()),
});
export type ConfidenceAnnotation = z.infer<typeof ConfidenceAnnotationSchema>;

export const OnchainIdentityStateSchema = z.object({
  registered: z.boolean(),
  agentId: z.string().optional(),
  registryAddress: z.string().optional(),
  domain: z.string().optional(),
  owner: z.string().optional(),
  active: z.boolean(),
  trustModels: z.array(z.string()),
});
export type OnchainIdentityState = z.infer<typeof OnchainIdentityStateSchema>;

export const EvidenceUrlSchema = z.object({
  type: z.enum(['transaction', 'attestation', 'feedback', 'validation']),
  url: z.string().url(),
  description: z.string().optional(),
  timestamp: z.string().datetime(),
});
export type EvidenceUrl = z.infer<typeof EvidenceUrlSchema>;

export const ReputationResponseSchema = z.object({
  agentAddress: z.string(),
  chain: ChainSchema,
  trustScore: z.number().min(0).max(100),
  completionRate: z.number().min(0).max(100),
  disputeRate: z.number().min(0).max(100),
  onchainIdentityState: OnchainIdentityStateSchema,
  evidenceUrls: z.array(EvidenceUrlSchema),
  freshness: FreshnessMetadataSchema,
  confidence: ConfidenceAnnotationSchema,
});
export type ReputationResponse = z.infer<typeof ReputationResponseSchema>;

export const HistoryEventTypeSchema = z.enum([
  'task_completed',
  'task_failed', 
  'dispute_raised',
  'dispute_resolved',
  'feedback_received',
  'attestation_added',
]);

export const HistoryEventSchema = z.object({
  id: z.string(),
  type: HistoryEventTypeSchema,
  timestamp: z.string().datetime(),
  details: z.record(z.string(), z.unknown()),
  evidenceUrl: z.string().url().optional(),
});
export type HistoryEvent = z.infer<typeof HistoryEventSchema>;

export const HistoryResponseSchema = z.object({
  agentAddress: z.string(),
  chain: ChainSchema,
  events: z.array(HistoryEventSchema),
  total: z.number().int().min(0),
  limit: z.number().int(),
  offset: z.number().int(),
  freshness: FreshnessMetadataSchema,
  confidence: ConfidenceAnnotationSchema,
});
export type HistoryResponse = z.infer<typeof HistoryResponseSchema>;

export const TrustComponentSchema = z.object({
  name: z.string(),
  score: z.number().min(0).max(100),
  weight: z.number().min(0).max(1),
  description: z.string(),
  evidenceCount: z.number().int().min(0),
});
export type TrustComponent = z.infer<typeof TrustComponentSchema>;

export const TrustBreakdownResponseSchema = z.object({
  agentAddress: z.string(),
  chain: ChainSchema,
  overallScore: z.number().min(0).max(100),
  components: z.array(TrustComponentSchema),
  freshness: FreshnessMetadataSchema,
  confidence: ConfidenceAnnotationSchema,
});
export type TrustBreakdownResponse = z.infer<typeof TrustBreakdownResponseSchema>;

// ============================================================================
// Error Schema
// ============================================================================

export const ErrorCodeSchema = z.enum([
  'INVALID_ADDRESS',
  'INVALID_CHAIN',
  'INVALID_TIMEFRAME',
  'AGENT_NOT_FOUND',
  'CHAIN_UNAVAILABLE',
  'RATE_LIMITED',
  'PAYMENT_REQUIRED',
  'INTERNAL_ERROR',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
  freshness: FreshnessMetadataSchema,
  confidence: ConfidenceAnnotationSchema,
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
