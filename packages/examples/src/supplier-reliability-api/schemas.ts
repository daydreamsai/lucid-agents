/**
 * Supplier Reliability Signal Marketplace API - Zod Schemas
 */
import { z } from 'zod';

export const SupplierIdSchema = z.string().min(1);
export const CategorySchema = z.string().min(1);
export const RegionSchema = z.string().min(1);
export const HorizonDaysSchema = z.number().int().min(1).max(365);
export const RiskToleranceSchema = z.enum(['low', 'medium', 'high']);

export const FreshnessMetadataSchema = z.object({
  freshness_ms: z.number().int().min(0),
  last_updated: z.string().datetime(),
  source: z.string(),
});

export const ConfidenceSchema = z.object({
  level: z.enum(['low', 'medium', 'high']),
  score: z.number().min(0).max(1),
  sample_size: z.number().int().min(0),
});

export const SupplierScoreInputSchema = z.object({
  supplierId: SupplierIdSchema,
  category: CategorySchema.optional(),
  region: RegionSchema.optional(),
});

export const SupplierScoreOutputSchema = z.object({
  supplier_id: SupplierIdSchema,
  supplier_score: z.number().min(0).max(100),
  fill_rate: z.number().min(0).max(1),
  on_time_delivery_rate: z.number().min(0).max(1),
  quality_score: z.number().min(0).max(100),
  confidence: ConfidenceSchema,
  freshness: FreshnessMetadataSchema,
});

export const LeadTimeForecastInputSchema = z.object({
  supplierId: SupplierIdSchema,
  category: CategorySchema,
  region: RegionSchema,
  horizonDays: HorizonDaysSchema.default(30),
});

export const LeadTimeForecastOutputSchema = z.object({
  supplier_id: SupplierIdSchema,
  category: CategorySchema,
  region: RegionSchema,
  horizon_days: HorizonDaysSchema,
  lead_time_p50: z.number().min(0),
  lead_time_p95: z.number().min(0),
  lead_time_drift: z.number(),
  trend: z.enum(['improving', 'stable', 'degrading']),
  confidence: ConfidenceSchema,
  freshness: FreshnessMetadataSchema,
});

export const DisruptionAlertsInputSchema = z.object({
  supplierId: SupplierIdSchema,
  category: CategorySchema.optional(),
  region: RegionSchema.optional(),
  riskTolerance: RiskToleranceSchema.default('medium'),
});

export const AlertReasonSchema = z.object({
  code: z.string(),
  description: z.string(),
  severity: z.enum(['info', 'warning', 'critical']),
  detected_at: z.string().datetime(),
});

export const DisruptionAlertsOutputSchema = z.object({
  supplier_id: SupplierIdSchema,
  disruption_probability: z.number().min(0).max(1),
  risk_level: z.enum(['low', 'medium', 'high', 'critical']),
  alert_reasons: z.array(AlertReasonSchema),
  recommended_actions: z.array(z.string()),
  confidence: ConfidenceSchema,
  freshness: FreshnessMetadataSchema,
});

export const ErrorCodeSchema = z.enum([
  'invalid_input', 'supplier_not_found', 'category_not_found',
  'region_not_found', 'payment_required', 'rate_limited', 'internal_error', 'stale_data',
]);

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});

export type SupplierId = z.infer<typeof SupplierIdSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type Region = z.infer<typeof RegionSchema>;
export type RiskTolerance = z.infer<typeof RiskToleranceSchema>;
export type FreshnessMetadata = z.infer<typeof FreshnessMetadataSchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export type SupplierScoreInput = z.infer<typeof SupplierScoreInputSchema>;
export type SupplierScoreOutput = z.infer<typeof SupplierScoreOutputSchema>;
export type LeadTimeForecastInput = z.infer<typeof LeadTimeForecastInputSchema>;
export type LeadTimeForecastOutput = z.infer<typeof LeadTimeForecastOutputSchema>;
export type DisruptionAlertsInput = z.infer<typeof DisruptionAlertsInputSchema>;
export type DisruptionAlertsOutput = z.infer<typeof DisruptionAlertsOutputSchema>;
export type AlertReason = z.infer<typeof AlertReasonSchema>;
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
