import { describe, expect, test } from "bun:test";
import { seedEvents } from "../../src/data/seed";
import { listEvents } from "../../src/logic/events";
import { computeImpactVectors } from "../../src/logic/vectors";
import { scoreScenario } from "../../src/logic/scoring";

describe("logic: events normalization", () => {
  test("filters by event type and geography", () => {
    const feed = listEvents(seedEvents, { eventTypes: ["cpi"], geography: ["US"] });
    expect(feed.length).toBeGreaterThan(0);
    expect(feed.every((e) => e.type === "cpi" && e.geography === "US")).toBe(true);
  });

  test("orders latest events first", () => {
    const feed = listEvents(seedEvents, {});
    expect(new Date(feed[0].timestamp).getTime()).toBeGreaterThanOrEqual(new Date(feed[feed.length - 1].timestamp).getTime());
  });
});

describe("logic: impact vectors", () => {
  test("returns vectors and aggregate confidence", () => {
    const result = computeImpactVectors({
      sectorSet: "equities,semiconductors",
      horizon: "30d",
      events: seedEvents,
    });

    expect(result.impact_vector.length).toBe(2);
    expect(result.confidence_band.low).toBeLessThanOrEqual(result.confidence_band.base);
    expect(result.confidence_band.base).toBeLessThanOrEqual(result.confidence_band.high);
    expect(result.sensitivity_breakdown.length).toBeGreaterThan(0);
  });
});

describe("logic: scenario scoring", () => {
  test("bullish scenario ranks higher when inflation and rates fall", () => {
    const bullish = scoreScenario({
      assumptions: { rateChangeBps: -50, cpiDelta: -0.4, gdpDelta: 0.4, geopoliticalRisk: 0.1 },
      targets: ["SPX"],
      horizon: "90d",
      events: seedEvents,
    });

    const bearish = scoreScenario({
      assumptions: { rateChangeBps: 50, cpiDelta: 0.4, gdpDelta: -0.4, geopoliticalRisk: 0.8 },
      targets: ["SPX"],
      horizon: "90d",
      events: seedEvents,
    });

    expect(bullish.scenario_score.score).toBeGreaterThan(bearish.scenario_score.score);
    expect(["bullish", "neutral", "bearish"]).toContain(bullish.scenario_score.rank);
  });
});
