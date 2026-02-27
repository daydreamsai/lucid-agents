import { z } from 'zod';

// Common schemas
export const RegionSchema = z.enum(['APAC', 'EMEA', 'AMER', 'LATAM']);
export const RiskToleranceSchema = z.enum(['low', 'medium', 'high']).default('medium');
export const SeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

// Supplier Score Endpoint
export const SupplierScoreRequestSchema = z.object({
  supplierId: z.string().min(1),
  category: z.string().optional(),
  region: RegionSchema,
});

export const SupplierScoreResponseSchema = z.object({
  supplier_score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  freshness_ms: z.number().nonnegative(),
  metadata: z.any().optional(),
});

// Lead Time Forecast Endpoint
export const LeadTimeForecastRequestSchema = z.object({
  supplierId: z.string().min(1),
  category: z.string().optional(),
  region: RegionSchema,
  horizonDays: z.number().int().min(1).max(365).default(30),
});

export const LeadTimeForecastResponseSchema = z.object({
  lead_time_p50: z.number().nonnegative(),
  lead_time_p95: z.number().nonnegative(),
  drift_probability: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  freshness_ms: z.number().nonnegative(),
}).refine(data => data.lead_time_p95 >= data.lead_time_p50, {
  message: 'lead_time_p95 must be >= lead_time_p50',
});

// Disruption Alerts Endpoint
export const DisruptionAlertsRequestSchema = z.object({
  supplierId: z.string().min(1),
  region: RegionSchema,
  riskTolerance: RiskToleranceSchema,
});

export const DisruptionAlertsResponseSchema = z.object({
  disruption_probability: z.number().min(0).max(1),
  alert_reasons: z.array(z.string()),
  severity: SeveritySchema,
  confidence: z.number().min(0).max(1),
  freshness_ms: z.number().nonnegative(),
});

// Error Response
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

// Type exports
export type SupplierScoreRequest = z.infer<typeof SupplierScoreRequestSchema>;
export type SupplierScoreResponse = z.infer<typeof SupplierScoreResponseSchema>;
export type LeadTimeForecastRequest = z.infer<typeof LeadTimeForecastRequestSchema>;
export type LeadTimeForecastResponse = z.infer<typeof LeadTimeForecastResponseSchema>;
export type DisruptionAlertsRequest = z.infer<typeof DisruptionAlertsRequestSchema>;
export type DisruptionAlertsResponse = z.infer<typeof DisruptionAlertsResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
