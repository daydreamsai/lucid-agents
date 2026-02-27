import { z } from "zod";

export const FreshnessSchema = z
  .object({
    fetchedAt: z.string().datetime(),
    staleness: z.number().int().nonnegative(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const EventSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(["rate-decision", "cpi", "gdp", "geopolitical"]),
    geography: z.string().min(2),
    timestamp: z.string().datetime(),
    severity: z.number().min(0).max(1),
    surprise: z.number(),
    title: z.string().min(1),
  })
  .strict();

export const ImpactPointSchema = z
  .object({
    growth: z.number(),
    inflation: z.number(),
    rates: z.number(),
    fx: z.number(),
    volatility: z.number(),
    supplyShock: z.number(),
  })
  .strict();

export const ImpactVectorSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(["sector", "asset", "supply-chain"]),
    horizon: z.enum(["7d", "30d", "90d", "180d"]),
    vector: ImpactPointSchema,
  })
  .strict();

export const ConfidenceBandSchema = z
  .object({
    low: z.number(),
    base: z.number(),
    high: z.number(),
  })
  .strict();

export const SensitivityEntrySchema = z
  .object({
    driver: z.string(),
    weight: z.number(),
    contribution: z.number(),
  })
  .strict();

export const ScenarioScoreSchema = z
  .object({
    score: z.number().min(0).max(100),
    rank: z.enum(["bullish", "neutral", "bearish"]),
    rationale: z.string().min(1),
    impactedTargets: z.array(z.string()).min(1),
  })
  .strict();

export const EventsQuerySchema = z
  .object({
    eventTypes: z.string().optional(),
    geography: z.string().optional(),
  })
  .strict();

export const ImpactVectorQuerySchema = z
  .object({
    sectorSet: z.string().min(1),
    horizon: z.enum(["7d", "30d", "90d", "180d"]),
  })
  .strict();

export const ScenarioRequestSchema = z
  .object({
    assumptions: z
      .object({
        rateChangeBps: z.number(),
        cpiDelta: z.number(),
        gdpDelta: z.number(),
        geopoliticalRisk: z.number().min(0).max(1),
      })
      .strict(),
    targets: z.array(z.string().min(1)).min(1),
    horizon: z.enum(["7d", "30d", "90d", "180d"]),
  })
  .strict();

export const EventsResponseSchema = z
  .object({
    event_feed: z.array(EventSchema),
    freshness: FreshnessSchema,
  })
  .strict();

export const ImpactVectorsResponseSchema = z
  .object({
    impact_vector: z.array(ImpactVectorSchema),
    confidence_band: ConfidenceBandSchema,
    sensitivity_breakdown: z.array(SensitivityEntrySchema),
    freshness: FreshnessSchema,
  })
  .strict();

export const ScenarioResponseSchema = z
  .object({
    scenario_score: ScenarioScoreSchema,
    impact_vector: z.array(ImpactVectorSchema),
    confidence_band: ConfidenceBandSchema,
    sensitivity_breakdown: z.array(SensitivityEntrySchema),
    freshness: FreshnessSchema,
  })
  .strict();

export const ErrorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
      })
      .strict(),
    freshness: FreshnessSchema,
  })
  .strict();

export const allSchemasJson = {
  EventsResponse: z.toJSONSchema(EventsResponseSchema),
  ImpactVectorsResponse: z.toJSONSchema(ImpactVectorsResponseSchema),
  ScenarioRequest: z.toJSONSchema(ScenarioRequestSchema),
  ScenarioResponse: z.toJSONSchema(ScenarioResponseSchema),
};

export type EventType = "rate-decision" | "cpi" | "gdp" | "geopolitical";
export type Horizon = "7d" | "30d" | "90d" | "180d";

export type MacroEvent = {
  id: string;
  type: EventType;
  geography: string;
  timestamp: string;
  severity: number;
  surprise: number;
  title: string;
};

export type Freshness = { fetchedAt: string; staleness: number; confidence: number };
