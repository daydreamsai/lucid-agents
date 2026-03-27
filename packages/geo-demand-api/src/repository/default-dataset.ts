import { DemandPoint, DemandSeries } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeCity(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, "-");
}

function buildPoints(values: number[], endAt: Date): DemandPoint[] {
  return values.map((value, idx) => {
    const offset = values.length - idx - 1;
    const at = new Date(endAt.getTime() - offset * DAY_MS);
    return { at: at.toISOString(), demand: round(value) };
  });
}

function generateWaveSeries(
  length: number,
  base: number,
  trendPerDay: number,
  waveAmplitude: number
): number[] {
  const values: number[] = [];
  for (let i = 0; i < length; i += 1) {
    const wave = Math.sin(i / 4) * waveAmplitude;
    values.push(base + i * trendPerDay + wave);
  }
  return values;
}

export function buildDefaultDemandDataset(now: Date = new Date()): DemandSeries[] {
  const days = 42;
  const updatedAt = now;

  const zip94107Values = generateWaveSeries(days, 48, 0.32, 3.2);
  const zip10001Values = generateWaveSeries(days, 42, 0.18, 2.1);
  const cityAustinValues = generateWaveSeries(days, 44, 0.41, 2.8);

  const zip94107: DemandSeries = {
    key: "zip:94107",
    kind: "zip",
    zip: "94107",
    points: buildPoints(zip94107Values, now),
    updatedAt
  };

  const zip10001: DemandSeries = {
    key: "zip:10001",
    kind: "zip",
    zip: "10001",
    points: buildPoints(zip10001Values, now),
    updatedAt
  };

  const cityAustin: DemandSeries = {
    key: `city:${normalizeCity("Austin")}:TX`,
    kind: "city",
    city: "Austin",
    state: "TX",
    points: buildPoints(cityAustinValues, now),
    updatedAt
  };

  return [zip94107, zip10001, cityAustin];
}