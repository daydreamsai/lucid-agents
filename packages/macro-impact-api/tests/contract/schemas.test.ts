import { describe, expect, test } from "bun:test";
import {
  EventsQuerySchema,
  EventsResponseSchema,
  ImpactVectorQuerySchema,
  ImpactVectorsResponseSchema,
  ScenarioRequestSchema,
  ScenarioResponseSchema,
  ErrorEnvelopeSchema,
  FreshnessSchema,
  allSchemasJson,
} from "../../src/schemas";

describe("contract: request schemas", () => {
  test("validates events query", () => {
    const parsed = EventsQuerySchema.parse({ eventTypes: "cpi,rate-decision", geography: "US" });
    expect(parsed.eventTypes).toBe("cpi,rate-decision");

    const invalid = EventsQuerySchema.safeParse({ unexpected: true });
    expect(invalid.success).toBe(false);
  });

  test("validates impact vector query", () => {
    const parsed = ImpactVectorQuerySchema.parse({ sectorSet: "equities", horizon: "30d" });
    expect(parsed.horizon).toBe("30d");

    const invalid = ImpactVectorQuerySchema.safeParse({ horizon: "100y" });
    expect(invalid.success).toBe(false);
  });

  test("validates scenario request", () => {
    const parsed = ScenarioRequestSchema.parse({
      assumptions: {
        rateChangeBps: -25,
        cpiDelta: -0.2,
        gdpDelta: 0.3,
        geopoliticalRisk: 0.5,
      },
      targets: ["SPX", "semiconductors"],
      horizon: "90d",
    });
    expect(parsed.targets.length).toBe(2);

    const invalid = ScenarioRequestSchema.safeParse({ assumptions: {}, targets: [] });
    expect(invalid.success).toBe(false);
  });
});

describe("contract: response schemas", () => {
  test("events response has feed + freshness", () => {
    const valid = EventsResponseSchema.safeParse({
      event_feed: [],
      freshness: { fetchedAt: new Date().toISOString(), staleness: 0, confidence: 0.9 },
    });
    expect(valid.success).toBe(true);
  });

  test("impact vectors response has required objects", () => {
    const valid = ImpactVectorsResponseSchema.safeParse({
      impact_vector: [
        { id: "x", type: "sector", horizon: "30d", vector: { growth: 0.1, inflation: -0.1, rates: 0.2, fx: 0.0, volatility: 0.3, supplyShock: -0.2 } },
      ],
      confidence_band: { low: -0.2, base: 0.1, high: 0.3 },
      sensitivity_breakdown: [{ driver: "cpi", weight: 0.5, contribution: -0.1 }],
      freshness: { fetchedAt: new Date().toISOString(), staleness: 20, confidence: 0.8 },
    });
    expect(valid.success).toBe(true);
  });

  test("scenario response has score + freshness", () => {
    const valid = ScenarioResponseSchema.safeParse({
      scenario_score: { score: 72, rank: "bullish", rationale: "Lower inflation", impactedTargets: ["SPX"] },
      impact_vector: [
        { id: "SPX", type: "asset", horizon: "90d", vector: { growth: 0.2, inflation: -0.1, rates: -0.2, fx: 0.1, volatility: -0.05, supplyShock: -0.1 } },
      ],
      confidence_band: { low: 60, base: 72, high: 80 },
      sensitivity_breakdown: [{ driver: "rates", weight: 0.6, contribution: 15 }],
      freshness: { fetchedAt: new Date().toISOString(), staleness: 10, confidence: 0.86 },
    });
    expect(valid.success).toBe(true);
  });

  test("error envelope includes freshness metadata", () => {
    const valid = ErrorEnvelopeSchema.safeParse({
      error: { code: "BAD_REQUEST", message: "invalid payload" },
      freshness: { fetchedAt: new Date().toISOString(), staleness: 0, confidence: 1 },
    });
    expect(valid.success).toBe(true);
  });

  test("freshness schema enforces confidence bounds", () => {
    expect(FreshnessSchema.safeParse({ fetchedAt: new Date().toISOString(), staleness: 0, confidence: 0.7 }).success).toBe(true);
    expect(FreshnessSchema.safeParse({ fetchedAt: new Date().toISOString(), staleness: 0, confidence: 2 }).success).toBe(false);
  });

  test("schemas export JSON Schema via zod v4 toJSONSchema", () => {
    expect(allSchemasJson.EventsResponse.type).toBe("object");
    expect(allSchemasJson.ScenarioRequest.type).toBe("object");
  });
});
