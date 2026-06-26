import type { Horizon, MacroEvent } from "../schemas";
import { computeImpactVectors } from "./vectors";
import { computeFreshness } from "./events";

function rankFromScore(score: number): "bullish" | "neutral" | "bearish" {
  if (score >= 60) return "bullish";
  if (score <= 40) return "bearish";
  return "neutral";
}

export function scoreScenario(input: {
  assumptions: { rateChangeBps: number; cpiDelta: number; gdpDelta: number; geopoliticalRisk: number };
  targets: string[];
  horizon: Horizon;
  events: MacroEvent[];
}) {
  const eventVectors = computeImpactVectors({ sectorSet: input.targets.join(","), horizon: input.horizon, events: input.events });

  const policyBoost = -input.assumptions.rateChangeBps * 0.18;
  const inflationBoost = -input.assumptions.cpiDelta * 18;
  const growthBoost = input.assumptions.gdpDelta * 20;
  const geoDrag = -input.assumptions.geopoliticalRisk * 25;

  const raw = 50 + policyBoost + inflationBoost + growthBoost + geoDrag;
  const score = Math.max(0, Math.min(100, +raw.toFixed(2)));
  const rank = rankFromScore(score);

  const confidence = Math.max(0, Math.min(1, eventVectors.freshness.confidence - input.assumptions.geopoliticalRisk * 0.15));

  return {
    scenario_score: {
      score,
      rank,
      rationale:
        rank === "bullish"
          ? "Disinflation and easier policy support risk assets"
          : rank === "bearish"
            ? "Sticky inflation/risk shocks pressure valuations"
            : "Mixed macro signals keep outcomes balanced",
      impactedTargets: input.targets,
    },
    impact_vector: eventVectors.impact_vector,
    confidence_band: {
      low: +(score - 10).toFixed(2),
      base: score,
      high: +(score + 10).toFixed(2),
    },
    sensitivity_breakdown: [
      { driver: "rates", weight: 0.3, contribution: +policyBoost.toFixed(2) },
      { driver: "cpi", weight: 0.25, contribution: +inflationBoost.toFixed(2) },
      { driver: "gdp", weight: 0.25, contribution: +growthBoost.toFixed(2) },
      { driver: "geopolitical", weight: 0.2, contribution: +geoDrag.toFixed(2) },
    ],
    freshness: computeFreshness(new Date().toISOString(), confidence),
  };
}
