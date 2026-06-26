import { z } from 'zod';

export const LineageRequestSchema = z.object({
  datasetId: z.string().min(1),
  sourceId: z.string().optional(),
  depth: z.number().int().min(1).max(10).default(3),
});

export const FreshnessRequestSchema = z.object({
  datasetId: z.string().min(1),
  sourceId: z.string().optional(),
  maxStalenessMs: z.number().int().positive().optional(),
});

export const VerifyHashRequestSchema = z.object({
  datasetId: z.string().min(1),
  expectedHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid hash format'),
  sourceId: z.string().optional(),
});

export const FreshnessMetaSchema = z.object({
  generated_at: z.string().datetime(),
  staleness_ms: z.number().int().nonnegative(),
  sla_status: z.enum(['fresh', 'stale', 'expired']),
});

export const LineageNodeSchema = z.object({
  id: z.string(),
  type: z.enum(['source', 'transform', 'aggregation', 'output']),
  name: z.string(),
  timestamp: z.string().datetime(),
  hash: z.string().optional(),
});

export const LineageEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  relationship: z.enum(['derived_from', 'aggregated_from', 'transformed_from', 'copied_from']),
});

export const LineageResponseSchema = z.object({
  lineage_graph: z.object({ nodes: z.array(LineageNodeSchema), edges: z.array(LineageEdgeSchema), root_id: z.string() }),
  depth_reached: z.number().int(),
  freshness: FreshnessMetaSchema,
  confidence: z.number().min(0).max(1),
});

export const FreshnessResponseSchema = z.object({
  staleness_ms: z.number().int().nonnegative(),
  sla_status: z.enum(['fresh', 'stale', 'expired', 'unknown']),
  last_updated: z.string().datetime(),
  update_frequency_ms: z.number().int().positive().optional(),
  next_expected_update: z.string().datetime().optional(),
  attestation_refs: z.array(z.string()),
  freshness: FreshnessMetaSchema,
  confidence: z.number().min(0).max(1),
});

export const VerifyHashResponseSchema = z.object({
  verification_status: z.enum(['verified', 'mismatch', 'not_found', 'error']),
  expected_hash: z.string(),
  actual_hash: z.string().nullable(),
  dataset_exists: z.boolean(),
  last_verified: z.string().datetime().optional(),
  attestation_refs: z.array(z.string()),
  freshness: FreshnessMetaSchema,
  confidence: z.number().min(0).max(1),
});

export type LineageRequest = z.infer<typeof LineageRequestSchema>;
export type LineageResponse = z.infer<typeof LineageResponseSchema>;
export type FreshnessRequest = z.infer<typeof FreshnessRequestSchema>;
export type FreshnessResponse = z.infer<typeof FreshnessResponseSchema>;
export type VerifyHashRequest = z.infer<typeof VerifyHashRequestSchema>;
export type VerifyHashResponse = z.infer<typeof VerifyHashResponseSchema>;
export type FreshnessMeta = z.infer<typeof FreshnessMetaSchema>;
