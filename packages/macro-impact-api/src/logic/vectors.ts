import type { Horizon, MacroEvent } from "../schemas";
import { computeFreshness } from "./events";

const baseDrivers: Record<string, number> = {
  "rate-decision": 0.35,
  cpi: 0.3,
  gdp: 0.2,
  geopolitical: 0.15,
};

function parseSectorSet(sectorSet: string): string[] {
  return sectorSet
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export function computeImpactVectors(input: { sectorSet: string; horizon: Horizon; events: MacroEvent[] }) {
  const sectors = parseSectorSet(input.sectorSet);
  const aggregateSignal = input.events.reduce((acc, event) => acc + event.severity * event.surprise, 0);

  const horizonScale: Record<Horizon, number> = { "7d": 0.8, "30d": 1, "90d": 1.15, "180d": 1.3 };
  const scale = horizonScale[input.horizon];

  const impact_vector = sectors.map((sector, idx) => {
    const sectorBias = (idx + 1) * 0.03;
    return {
      id: sector,
      type: sector.includes("/") ? "supply-chain" : sector.toUpperCase() === sector ? "asset" : "sector",
      horizon: input.horizon,
      vector: {
        growth: +(aggregateSignal * 0.4 * scale + sectorBias).toFixed(4),
        inflation: +(-aggregateSignal * 0.25 * scale).toFixed(4),
        rates: +(-aggregateSignal * 0.3 * scale).toFixed(4),
        fx: +(aggregateSignal * 0.1 * scale).toFixed(4),
        volatility: +(Math.abs(aggregateSignal) * 0.45 * scale).toFixed(4),
        supplyShock: +(aggregateSignal * -0.2 * scale).toFixed(4),
      },
    };
  });

  const base = +((aggregateSignal * 0.6 + 0.1) * 100).toFixed(2);
  const confidence = Math.max(0.4, Math.min(0.95, 0.7 + input.events.length * 0.03 - Math.abs(aggregateSignal) * 0.05));

  const sensitivity_breakdown = Object.entries(baseDrivers).map(([driver, weight]) => {
    const contribution = input.events
      .filter((event) => event.type === driver)
      .reduce((acc, event) => acc + event.severity * event.surprise * weight * 100, 0);
    return { driver, weight, contribution: +contribution.toFixed(2) };
  });

  return {
    impact_vector,
    confidence_band: {
      low: +(base - 8).toFixed(2),
      base,
      high: +(base + 8).toFixed(2),
    },
    sensitivity_breakdown,
    freshness: computeFreshness(new Date().toISOString(), confidence),
  };
}
