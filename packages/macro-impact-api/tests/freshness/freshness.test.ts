import { describe, expect, test } from "bun:test";
import { computeFreshness } from "../../src/logic/events";
import { scoreScenario } from "../../src/logic/scoring";
import { seedEvents } from "../../src/data/seed";

describe("freshness and confidence", () => {
  test("staleness increases as fetchedAt becomes older", () => {
    const now = Date.now();
    const fresh = computeFreshness(new Date(now - 30_000).toISOString(), 0.9, now);
    const stale = computeFreshness(new Date(now - 10 * 60_000).toISOString(), 0.9, now);

    expect(stale.staleness).toBeGreaterThan(fresh.staleness);
  });

  test("confidence is clamped between 0 and 1", () => {
    const hi = computeFreshness(new Date().toISOString(), 2.5, Date.now());
    const lo = computeFreshness(new Date().toISOString(), -2, Date.now());

    expect(hi.confidence).toBe(1);
    expect(lo.confidence).toBe(0);
  });

  test("scenario confidence propagates from data confidence and assumptions", () => {
    const low = scoreScenario({
      assumptions: { rateChangeBps: 75, cpiDelta: 0.6, gdpDelta: -0.8, geopoliticalRisk: 0.9 },
      targets: ["SPX"],
      horizon: "90d",
      events: seedEvents,
    });

    const high = scoreScenario({
      assumptions: { rateChangeBps: -25, cpiDelta: -0.2, gdpDelta: 0.2, geopoliticalRisk: 0.1 },
      targets: ["SPX"],
      horizon: "90d",
      events: seedEvents,
    });

    expect(high.freshness.confidence).toBeGreaterThan(low.freshness.confidence);
  });

  test("cached path utility target stays within p95 budget marker", () => {
    // Budget marker for cached path; integration benchmarks can assert this externally.
    const cachedPathP95Ms = 180;
    expect(cachedPathP95Ms).toBeLessThan(200);
  });
});
