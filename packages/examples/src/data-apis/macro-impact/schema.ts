import { z } from 'zod';

export const EventTypesSchema = z.enum(['rate_decision', 'gdp_release', 'inflation_data', 'employment', 'trade_balance', 'geopolitical', 'natural_disaster', 'policy_change']);
export const GeographySchema = z.enum(['global', 'north_america', 'europe', 'asia_pacific', 'emerging_markets', 'latam']);
export const HorizonSchema = z.enum(['1d', '1w', '1m', '3m', '6m', '1y']);

export const EventsRequestSchema = z.object({
  eventTypes: z.array(EventTypesSchema).optional(),
  geography: GeographySchema.optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export const ImpactVectorsRequestSchema = z.object({
  eventTypes: z.array(EventTypesSchema).optional(),
  geography: GeographySchema.optional(),
  sectorSet: z.array(z.string()).optional(),
  horizon: HorizonSchema.default('1m'),
});

export const ScenarioScoreRequestSchema = z.object({
  scenarioAssumptions: z.array(z.object({ variable: z.string(), change_percent: z.number(), probability: z.number().min(0).max(1).optional() })).min(1),
  sectorSet: z.array(z.string()).optional(),
  horizon: HorizonSchema.default('3m'),
});

export const FreshnessSchema = z.object({ generated_at: z.string().datetime(), staleness_ms: z.number().int().nonnegative(), sla_status: z.enum(['fresh', 'stale', 'expired']) });
export const MacroEventSchema = z.object({ event_id: z.string(), event_type: EventTypesSchema, title: z.string(), geography: GeographySchema, timestamp: z.string().datetime(), severity: z.enum(['low', 'medium', 'high', 'critical']), summary: z.string() });
export const EventsResponseSchema = z.object({ event_feed: z.array(MacroEventSchema), total_count: z.number().int().nonnegative(), freshness: FreshnessSchema, confidence: z.number().min(0).max(1) });
export const ImpactVectorSchema = z.object({ sector: z.string(), impact_score: z.number().min(-100).max(100), direction: z.enum(['positive', 'negative', 'neutral']), magnitude: z.enum(['minimal', 'moderate', 'significant', 'severe']), confidence_band: z.object({ lower: z.number(), upper: z.number() }) });
export const ImpactVectorsResponseSchema = z.object({ impact_vector: z.array(ImpactVectorSchema), confidence_band: z.object({ lower: z.number(), upper: z.number() }), sensitivity_breakdown: z.array(z.object({ factor: z.string(), weight: z.number() })), freshness: FreshnessSchema, confidence: z.number().min(0).max(1) });
export const ScenarioScoreResponseSchema = z.object({ scenario_score: z.number().min(-100).max(100), risk_assessment: z.enum(['very_low', 'low', 'moderate', 'high', 'very_high']), sector_impacts: z.array(z.object({ sector: z.string(), impact: z.number(), direction: z.enum(['positive', 'negative', 'neutral']) })), key_drivers: z.array(z.string()), freshness: FreshnessSchema, confidence: z.number().min(0).max(1) });

export type EventsRequest = z.infer<typeof EventsRequestSchema>;
export type EventsResponse = z.infer<typeof EventsResponseSchema>;
export type ImpactVectorsRequest = z.infer<typeof ImpactVectorsRequestSchema>;
export type ImpactVectorsResponse = z.infer<typeof ImpactVectorsResponseSchema>;
export type ScenarioScoreRequest = z.infer<typeof ScenarioScoreRequestSchema>;
export type ScenarioScoreResponse = z.infer<typeof ScenarioScoreResponseSchema>;
export type MacroEvent = z.infer<typeof MacroEventSchema>;
export type ImpactVector = z.infer<typeof ImpactVectorSchema>;
export type Freshness = z.infer<typeof FreshnessSchema>;
