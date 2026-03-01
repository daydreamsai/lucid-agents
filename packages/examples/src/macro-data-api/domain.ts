import {
  type Geography,
  type Horizon,
  type MacroEventType,
  type MacroInput,
  type ScenarioAssumptions,
  type Sector,
} from './contracts';

export type NormalizedInput = MacroInput;

export type MacroEvent = {
  event_id: string;
  event_type: MacroEventType;
  title: string;
  geography: Geography;
  as_of: string;
  severity: number;
};

export type Freshness = {
  as_of: string;
  age_ms: number;
  max_age_ms: number;
  is_stale: boolean;
};

export type ConfidenceInput = {
  base: number;
  freshnessPenalty: number;
  assumptionCoverage: number;
};

export type Confidence = {
  score: number;
  band: 'low' | 'medium' | 'high';
  method: string;
};

type ImpactTemplate = {
  sectors: Record<Sector, number>;
  assets: Record<'USD_INDEX' | 'US10Y' | 'WTI' | 'GOLD', number>;
  supply_chain: Record<'SHIPPING' | 'SEMICONDUCTORS' | 'AGRICULTURE', number>;
};

const EVENT_ALIASES: Record<string, MacroEventType> = {
  CPI: 'CPI',
  INFLATION: 'CPI',
  FED_RATE: 'FED_RATE',
  'FED RATE': 'FED_RATE',
  FOMC: 'FED_RATE',
  PMI: 'PMI',
  UNEMPLOYMENT: 'UNEMPLOYMENT',
  JOBS: 'UNEMPLOYMENT',
  OIL_SUPPLY: 'OIL_SUPPLY',
  OIL: 'OIL_SUPPLY',
  GEOPOLITICAL_RISK: 'GEOPOLITICAL_RISK',
  GEOPOLITICAL: 'GEOPOLITICAL_RISK',
};

const GEOGRAPHY_ALIASES: Record<string, Geography> = {
  US: 'US',
  USA: 'US',
  EU: 'EU',
  EUROPE: 'EU',
  APAC: 'APAC',
  ASIA: 'APAC',
  GLOBAL: 'GLOBAL',
  WORLD: 'GLOBAL',
};

const SECTOR_ALIASES: Record<string, Sector> = {
  EQUITIES: 'EQUITIES',
  STOCKS: 'EQUITIES',
  BONDS: 'BONDS',
  ENERGY: 'ENERGY',
  TECH: 'TECH',
  TECHNOLOGY: 'TECH',
  INDUSTRIALS: 'INDUSTRIALS',
};

const HORIZON_ALIASES: Record<string, Horizon> = {
  '1W': '1w',
  '1M': '1m',
  '3M': '3m',
  '6M': '6m',
  '12M': '12m',
};

const HORIZON_MULTIPLIER: Record<Horizon, number> = {
  '1w': 0.7,
  '1m': 0.85,
  '3m': 1,
  '6m': 1.15,
  '12m': 1.25,
};

const GEOGRAPHY_MULTIPLIER: Record<Geography, number> = {
  US: 1,
  EU: 0.9,
  APAC: 0.95,
  GLOBAL: 1.1,
};

const EVENT_IMPACT: Record<MacroEventType, ImpactTemplate> = {
  CPI: {
    sectors: {
      EQUITIES: -0.62,
      BONDS: -0.78,
      ENERGY: 0.43,
      TECH: -0.71,
      INDUSTRIALS: -0.28,
    },
    assets: { USD_INDEX: 0.47, US10Y: 0.56, WTI: 0.22, GOLD: -0.18 },
    supply_chain: { SHIPPING: -0.11, SEMICONDUCTORS: -0.23, AGRICULTURE: 0.09 },
  },
  FED_RATE: {
    sectors: {
      EQUITIES: -0.49,
      BONDS: -0.66,
      ENERGY: -0.08,
      TECH: -0.59,
      INDUSTRIALS: -0.25,
    },
    assets: { USD_INDEX: 0.53, US10Y: 0.62, WTI: -0.12, GOLD: -0.24 },
    supply_chain: { SHIPPING: -0.09, SEMICONDUCTORS: -0.19, AGRICULTURE: -0.05 },
  },
  PMI: {
    sectors: {
      EQUITIES: 0.39,
      BONDS: -0.21,
      ENERGY: 0.28,
      TECH: 0.34,
      INDUSTRIALS: 0.41,
    },
    assets: { USD_INDEX: 0.06, US10Y: 0.13, WTI: 0.25, GOLD: -0.07 },
    supply_chain: { SHIPPING: 0.29, SEMICONDUCTORS: 0.22, AGRICULTURE: 0.11 },
  },
  UNEMPLOYMENT: {
    sectors: {
      EQUITIES: -0.33,
      BONDS: 0.18,
      ENERGY: -0.21,
      TECH: -0.27,
      INDUSTRIALS: -0.31,
    },
    assets: { USD_INDEX: -0.08, US10Y: -0.22, WTI: -0.19, GOLD: 0.17 },
    supply_chain: { SHIPPING: -0.14, SEMICONDUCTORS: -0.11, AGRICULTURE: -0.06 },
  },
  OIL_SUPPLY: {
    sectors: {
      EQUITIES: -0.19,
      BONDS: -0.12,
      ENERGY: 0.71,
      TECH: -0.15,
      INDUSTRIALS: -0.22,
    },
    assets: { USD_INDEX: 0.11, US10Y: 0.06, WTI: 0.81, GOLD: 0.04 },
    supply_chain: { SHIPPING: -0.31, SEMICONDUCTORS: -0.17, AGRICULTURE: 0.12 },
  },
  GEOPOLITICAL_RISK: {
    sectors: {
      EQUITIES: -0.41,
      BONDS: 0.29,
      ENERGY: 0.35,
      TECH: -0.38,
      INDUSTRIALS: -0.26,
    },
    assets: { USD_INDEX: 0.23, US10Y: -0.14, WTI: 0.33, GOLD: 0.51 },
    supply_chain: { SHIPPING: -0.39, SEMICONDUCTORS: -0.28, AGRICULTURE: -0.12 },
  },
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const rounded = (value: number): number => Math.round(value * 1000) / 1000;

const normalizeKey = (value: string): string =>
  value.trim().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').toUpperCase();

function normalizeEventType(value: string): MacroEventType {
  const key = normalizeKey(value);
  const normalized = EVENT_ALIASES[key] ?? EVENT_ALIASES[key.replace(/ /g, '_')];
  if (!normalized) {
    throw new Error(`Unsupported event type: ${value}`);
  }
  return normalized;
}

function normalizeGeography(value: string): Geography {
  const normalized = GEOGRAPHY_ALIASES[normalizeKey(value)];
  if (!normalized) {
    throw new Error(`Unsupported geography: ${value}`);
  }
  return normalized;
}

function normalizeSector(value: string): Sector {
  const normalized = SECTOR_ALIASES[normalizeKey(value)];
  if (!normalized) {
    throw new Error(`Unsupported sector: ${value}`);
  }
  return normalized;
}

function normalizeHorizon(value: string): Horizon {
  const normalized = HORIZON_ALIASES[normalizeKey(value)] as Horizon | undefined;
  if (!normalized) {
    throw new Error(`Unsupported horizon: ${value}`);
  }
  return normalized;
}

export function normalizeMacroInput(input: {
  eventTypes: string[];
  geography: string;
  sectorSet: string[];
  horizon: string;
}): NormalizedInput {
  return {
    eventTypes: input.eventTypes.map(normalizeEventType),
    geography: normalizeGeography(input.geography),
    sectorSet: input.sectorSet.map(normalizeSector),
    horizon: normalizeHorizon(input.horizon),
  };
}

export function buildEventFeed(input: NormalizedInput, now: Date): MacroEvent[] {
  const baseMs = now.getTime();
  return input.eventTypes.map((eventType, index) => {
    const lagMinutes = 20 + index * 35;
    const asOf = new Date(baseMs - lagMinutes * 60 * 1000);
    const severity = rounded(
      clamp(
        Math.abs(EVENT_IMPACT[eventType].sectors.EQUITIES) *
          HORIZON_MULTIPLIER[input.horizon] *
          GEOGRAPHY_MULTIPLIER[input.geography],
        0.05,
        0.99
      )
    );

    return {
      event_id: `${eventType}-${input.geography}-${asOf.toISOString().slice(0, 10)}`,
      event_type: eventType,
      title: `${eventType.replace(/_/g, ' ')} update`,
      geography: input.geography,
      as_of: asOf.toISOString(),
      severity,
    };
  });
}

export function buildImpactVector(input: NormalizedInput): {
  sectors: Record<string, number>;
  assets: Record<string, number>;
  supply_chain: Record<string, number>;
  sensitivity_breakdown: Array<{ factor: string; weight: number; contribution: number }>;
} {
  const horizonFactor = HORIZON_MULTIPLIER[input.horizon];
  const geographyFactor = GEOGRAPHY_MULTIPLIER[input.geography];
  const multiplier = horizonFactor * geographyFactor;

  const sectors: Record<string, number> = {};
  for (const sector of input.sectorSet) {
    sectors[sector] = 0;
  }

  const assets: Record<string, number> = {
    USD_INDEX: 0,
    US10Y: 0,
    WTI: 0,
    GOLD: 0,
  };

  const supplyChain: Record<string, number> = {
    SHIPPING: 0,
    SEMICONDUCTORS: 0,
    AGRICULTURE: 0,
  };

  const sensitivity_breakdown: Array<{ factor: string; weight: number; contribution: number }> = [];

  for (const eventType of input.eventTypes) {
    const template = EVENT_IMPACT[eventType];
    const eventWeight = rounded(1 / input.eventTypes.length);

    for (const sector of input.sectorSet) {
      sectors[sector] = rounded(sectors[sector] + template.sectors[sector] * multiplier * eventWeight);
    }

    for (const [asset, value] of Object.entries(template.assets)) {
      assets[asset] = rounded(assets[asset] + value * multiplier * eventWeight);
    }

    for (const [node, value] of Object.entries(template.supply_chain)) {
      supplyChain[node] = rounded(supplyChain[node] + value * multiplier * eventWeight);
    }

    sensitivity_breakdown.push({
      factor: eventType,
      weight: eventWeight,
      contribution: rounded(template.sectors.EQUITIES * multiplier * eventWeight),
    });
  }

  return {
    sectors,
    assets,
    supply_chain: supplyChain,
    sensitivity_breakdown,
  };
}

export function scoreScenario(
  input: NormalizedInput,
  assumptions: ScenarioAssumptions
): {
  total: number;
  normalized: number;
  rank: 'high-risk' | 'moderate-risk' | 'low-risk';
  drivers: Array<{ name: string; impact: number }>;
} {
  const vector = buildImpactVector(input);
  const avgSectorImpact =
    Object.values(vector.sectors).reduce((sum, value) => sum + value, 0) /
    Math.max(Object.values(vector.sectors).length, 1);

  const inflationShock = assumptions.inflationShock ?? 0;
  const oilShock = assumptions.oilShock ?? 0;
  const policySurprise = assumptions.policySurprise ?? 0;
  const demandShock = assumptions.demandShock ?? 0;

  const penalty =
    inflationShock * 18 + oilShock * 11 + policySurprise * 9 + demandShock * 7;
  const structural = avgSectorImpact * 12;
  const total = clamp(100 + structural - penalty, 0, 100);

  const rank: 'high-risk' | 'moderate-risk' | 'low-risk' =
    total < 35 ? 'high-risk' : total < 65 ? 'moderate-risk' : 'low-risk';

  return {
    total: rounded(total),
    normalized: rounded(total / 100),
    rank,
    drivers: [
      { name: 'inflationShock', impact: rounded(-inflationShock * 18) },
      { name: 'oilShock', impact: rounded(-oilShock * 11) },
      { name: 'policySurprise', impact: rounded(-policySurprise * 9) },
      { name: 'demandShock', impact: rounded(-demandShock * 7) },
      { name: 'structuralMacroVector', impact: rounded(structural) },
    ],
  };
}

export function computeFreshness(params: {
  asOf: Date;
  now: Date;
  maxAgeMs: number;
}): Freshness {
  const ageMs = Math.max(0, params.now.getTime() - params.asOf.getTime());
  return {
    as_of: params.asOf.toISOString(),
    age_ms: ageMs,
    max_age_ms: params.maxAgeMs,
    is_stale: ageMs > params.maxAgeMs,
  };
}

export function propagateConfidence(input: ConfidenceInput): Confidence {
  const raw =
    input.base * 0.7 +
    (1 - input.freshnessPenalty) * 0.2 +
    input.assumptionCoverage * 0.1;

  const score = rounded(clamp(raw, 0, 1));
  const band: 'low' | 'medium' | 'high' =
    score >= 0.75 ? 'high' : score >= 0.5 ? 'medium' : 'low';

  return {
    score,
    band,
    method: 'weighted_signal_quality_v1',
  };
}

export function toConfidenceBand(score: number): {
  low: number;
  mid: number;
  high: number;
} {
  return {
    low: rounded(clamp(score - 0.12, 0, 1)),
    mid: rounded(clamp(score, 0, 1)),
    high: rounded(clamp(score + 0.12, 0, 1)),
  };
}
