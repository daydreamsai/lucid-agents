const NASA_NEOWS_FEED_URL = 'https://api.nasa.gov/neo/rest/v1/feed';

export type RiskLevel = 'low' | 'guarded' | 'elevated' | 'high';

export type AsteroidThreat = {
  id: string;
  name: string;
  nasaJplUrl: string;
  isPotentiallyHazardous: boolean;
  approachDate: string;
  estimatedDiameterMeters: number;
  relativeVelocityKph: number;
  missDistanceKm: number;
  threatScore: number;
};

export type NeoRiskAssessment = {
  level: RiskLevel;
  summary: string;
  highestThreatScore: number;
  highThreatCount: number;
  trackedCount: number;
};

export type NeoRiskReport = {
  windowStart: string;
  windowEnd: string;
  generatedAt: string;
  objectCount: number;
  topThreats: AsteroidThreat[];
  assessment: NeoRiskAssessment;
};

type NasaCloseApproachData = {
  close_approach_date?: string;
  close_approach_date_full?: string;
  relative_velocity?: {
    kilometers_per_hour?: string;
  };
  miss_distance?: {
    kilometers?: string;
  };
};

type NasaNeo = {
  id?: string;
  name?: string;
  nasa_jpl_url?: string;
  is_potentially_hazardous_asteroid?: boolean;
  estimated_diameter?: {
    meters?: {
      estimated_diameter_max?: number;
    };
  };
  close_approach_data?: NasaCloseApproachData[];
};

type NasaNeoFeedResponse = {
  near_earth_objects?: Record<string, NasaNeo[]>;
};

type ScoringInput = {
  estimatedDiameterMeters: number;
  relativeVelocityKph: number;
  missDistanceKm: number;
  isPotentiallyHazardous: boolean;
};

type GetNeoRiskReportOptions = {
  apiKey: string;
  topN?: number;
  now?: Date;
  fetchImpl?: typeof fetch;
};

type FetchNeoFeedOptions = {
  apiKey: string;
  startDate: string;
  endDate: string;
  fetchImpl?: typeof fetch;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value: string | number | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatDateUtc(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getNextSevenDayWindow(now: Date): { startDate: string; endDate: string } {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return {
    startDate: formatDateUtc(start),
    endDate: formatDateUtc(end),
  };
}

function findApproachForDate(
  approaches: NasaCloseApproachData[] | undefined,
  dateKey: string
): NasaCloseApproachData | undefined {
  if (!approaches || approaches.length === 0) {
    return undefined;
  }

  const match = approaches.find(approach => {
    if (approach.close_approach_date === dateKey) {
      return true;
    }
    if (
      approach.close_approach_date_full &&
      approach.close_approach_date_full.startsWith(dateKey)
    ) {
      return true;
    }
    return false;
  });

  return match ?? approaches[0];
}

export function calculateThreatScore(input: ScoringInput): number {
  const sizeNormalized = clamp(input.estimatedDiameterMeters / 1000, 0, 1);
  const velocityNormalized = clamp(input.relativeVelocityKph / 100000, 0, 1);
  const proximityNormalized = clamp(1 - input.missDistanceKm / 7500000, 0, 1);
  const hazardBonus = input.isPotentiallyHazardous ? 0.15 : 0;

  const weighted =
    sizeNormalized * 0.45 +
    velocityNormalized * 0.35 +
    proximityNormalized * 0.2 +
    hazardBonus;

  return Number((clamp(weighted, 0, 1) * 100).toFixed(2));
}

export function extractThreatsFromFeed(data: NasaNeoFeedResponse): AsteroidThreat[] {
  const byDate = data.near_earth_objects ?? {};
  const threats: AsteroidThreat[] = [];

  for (const [dateKey, items] of Object.entries(byDate)) {
    for (const item of items) {
      const approach = findApproachForDate(item.close_approach_data, dateKey);
      if (!approach) {
        continue;
      }

      const estimatedDiameterMeters = toNumber(
        item.estimated_diameter?.meters?.estimated_diameter_max
      );
      const relativeVelocityKph = toNumber(
        approach.relative_velocity?.kilometers_per_hour
      );
      const missDistanceKm = toNumber(approach.miss_distance?.kilometers);
      const isPotentiallyHazardous = Boolean(
        item.is_potentially_hazardous_asteroid
      );

      const threat = {
        id: item.id ?? `${item.name ?? 'unknown'}-${dateKey}`,
        name: item.name ?? 'Unknown asteroid',
        nasaJplUrl: item.nasa_jpl_url ?? '',
        isPotentiallyHazardous,
        approachDate: dateKey,
        estimatedDiameterMeters,
        relativeVelocityKph,
        missDistanceKm,
        threatScore: calculateThreatScore({
          estimatedDiameterMeters,
          relativeVelocityKph,
          missDistanceKm,
          isPotentiallyHazardous,
        }),
      } satisfies AsteroidThreat;

      threats.push(threat);
    }
  }

  return threats;
}

export function rankThreats(threats: AsteroidThreat[], topN = 10): AsteroidThreat[] {
  return [...threats]
    .sort((a, b) => {
      if (b.threatScore !== a.threatScore) {
        return b.threatScore - a.threatScore;
      }
      return a.missDistanceKm - b.missDistanceKm;
    })
    .slice(0, Math.max(1, topN));
}

export function buildRiskAssessment(threats: AsteroidThreat[]): NeoRiskAssessment {
  const highestThreatScore = threats[0]?.threatScore ?? 0;
  const highThreatCount = threats.filter(t => t.threatScore >= 55).length;
  const trackedCount = threats.length;

  let level: RiskLevel = 'low';
  if (highestThreatScore >= 70 || highThreatCount >= 3) {
    level = 'high';
  } else if (highestThreatScore >= 45 || highThreatCount >= 2) {
    level = 'elevated';
  } else if (highestThreatScore >= 25) {
    level = 'guarded';
  }

  const summary =
    level === 'high'
      ? 'High-risk window: one or more objects have a high modeled threat score.'
      : level === 'elevated'
        ? 'Elevated-risk window: monitor top objects with notable speed/size/proximity.'
        : level === 'guarded'
          ? 'Guarded-risk window: no high-risk objects, but track the top approaches.'
          : 'Low-risk window: modeled scores are low across the observed objects.';

  return {
    level,
    summary,
    highestThreatScore,
    highThreatCount,
    trackedCount,
  };
}

export function createNeoRiskReport(options: {
  windowStart: string;
  windowEnd: string;
  threats: AsteroidThreat[];
  topN?: number;
}): NeoRiskReport {
  const rankedThreats = rankThreats(
    options.threats,
    Math.max(options.threats.length, 1)
  );
  const topThreats = rankedThreats.slice(0, Math.max(1, options.topN ?? 10));
  return {
    windowStart: options.windowStart,
    windowEnd: options.windowEnd,
    generatedAt: new Date().toISOString(),
    objectCount: options.threats.length,
    topThreats,
    assessment: buildRiskAssessment(rankedThreats),
  };
}

export async function fetchNeoFeed(
  options: FetchNeoFeedOptions
): Promise<NasaNeoFeedResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    start_date: options.startDate,
    end_date: options.endDate,
    api_key: options.apiKey,
  });

  const response = await fetchImpl(`${NASA_NEOWS_FEED_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(
      `NASA NeoWs request failed with ${response.status}: ${response.statusText}`
    );
  }

  return (await response.json()) as NasaNeoFeedResponse;
}

export async function getNeoRiskReport(
  options: GetNeoRiskReportOptions
): Promise<NeoRiskReport> {
  const now = options.now ?? new Date();
  const { startDate, endDate } = getNextSevenDayWindow(now);
  const neoFeed = await fetchNeoFeed({
    apiKey: options.apiKey,
    startDate,
    endDate,
    fetchImpl: options.fetchImpl,
  });

  const threats = extractThreatsFromFeed(neoFeed);
  return createNeoRiskReport({
    windowStart: startDate,
    windowEnd: endDate,
    threats,
    topN: options.topN,
  });
}
