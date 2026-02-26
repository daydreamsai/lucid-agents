import { z } from 'zod';

export const DatasetIdSchema = z.string().min(1);
export const SourceIdSchema = z.string().min(1);
export const HashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
export const TimestampMsSchema = z.number().int().positive();
export const ConfidenceSchema = z.number().min(0).max(1);
export const SlaStatusSchema = z.enum(['met', 'warning', 'breached']);
export const VerificationStatusSchema = z.enum(['verified', 'failed', 'pending', 'unknown']);

export const LineageNodeSchema = z.object({
  id: z.string(),
  type: z.enum(['source', 'transform', 'aggregation', 'output']),
  name: z.string(),
  timestamp: TimestampMsSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const LineageEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  relationship: z.enum(['derived_from', 'aggregated_from', 'transformed_from', 'copied_from']),
  confidence: ConfidenceSchema.optional(),
});

export const LineageGraphSchema = z.object({
  nodes: z.array(LineageNodeSchema),
  edges: z.array(LineageEdgeSchema),
  root: z.string(),
  depth: z.number().int().min(0),
});

export const AttestationRefSchema = z.object({
  id: z.string(),
  type: z.enum(['onchain', 'offchain', 'signature']),
  issuer: z.string(),
  timestamp: TimestampMsSchema,
  chainId: z.string().optional(),
  txHash: z.string().optional(),
  signature: z.string().optional(),
});

export const FreshnessMetadataSchema = z.object({
  queriedAt: TimestampMsSchema,
  dataTimestamp: TimestampMsSchema,
  stalenessMs: z.number().int().min(0),
  confidence: ConfidenceSchema,
});

export const LineageRequestSchema = z.object({
  datasetId: DatasetIdSchema,
  maxDepth: z.number().int().min(1).max(10).default(3),
  includeMetadata: z.boolean().default(false),
});

export const FreshnessRequestSchema = z.object({
  datasetId: DatasetIdSchema,
  sourceId: SourceIdSchema.optional(),
  maxStalenessMs: TimestampMsSchema.optional(),
});

export const VerifyHashRequestSchema = z.object({
  datasetId: DatasetIdSchema,
  expectedHash: HashSchema,
  sourceId: SourceIdSchema.optional(),
});

export const LineageResponseSchema = z.object({
  datasetId: DatasetIdSchema,
  lineageGraph: LineageGraphSchema,
  attestationRefs: z.array(AttestationRefSchema),
  freshness: FreshnessMetadataSchema,
});

export const FreshnessResponseSchema = z.object({
  datasetId: DatasetIdSchema,
  sourceId: SourceIdSchema.optional(),
  stalenessMs: z.number().int().min(0),
  slaStatus: SlaStatusSchema,
  slaThresholdMs: TimestampMsSchema.optional(),
  lastUpdated: TimestampMsSchema,
  nextExpectedUpdate: TimestampMsSchema.optional(),
  confidence: ConfidenceSchema,
  freshness: FreshnessMetadataSchema,
});

export const VerifyHashResponseSchema = z.object({
  datasetId: DatasetIdSchema,
  expectedHash: HashSchema,
  actualHash: HashSchema.optional(),
  verificationStatus: VerificationStatusSchema,
  attestationRefs: z.array(AttestationRefSchema),
  verifiedAt: TimestampMsSchema,
  confidence: ConfidenceSchema,
  freshness: FreshnessMetadataSchema,
});

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type DatasetId = z.infer<typeof DatasetIdSchema>;
export type SlaStatus = z.infer<typeof SlaStatusSchema>;
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;
export type LineageNode = z.infer<typeof LineageNodeSchema>;
export type LineageEdge = z.infer<typeof LineageEdgeSchema>;
export type LineageGraph = z.infer<typeof LineageGraphSchema>;
export type AttestationRef = z.infer<typeof AttestationRefSchema>;
export type FreshnessMetadata = z.infer<typeof FreshnessMetadataSchema>;
export type LineageRequest = z.infer<typeof LineageRequestSchema>;
export type LineageResponse = z.infer<typeof LineageResponseSchema>;
export type FreshnessRequest = z.infer<typeof FreshnessRequestSchema>;
export type FreshnessResponse = z.infer<typeof FreshnessResponseSchema>;
export type VerifyHashRequest = z.infer<typeof VerifyHashRequestSchema>;
export type VerifyHashResponse = z.infer<typeof VerifyHashResponseSchema>;
