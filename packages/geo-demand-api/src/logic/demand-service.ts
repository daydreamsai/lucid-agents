import { ApiError } from "../errors";
import {
  DemandAnomaliesResult,
  DemandIndexResult,
  DemandLocation,
  DemandRepository,
  DemandSeries,
  DemandTrendResult,
  LocationQuery
} from "../types";
import { clamp, mean, round, stdDev } from "./stats";

type NormalizedLocation =
  | { kind: "zip"; zip: string }
  | { kind: "city"; city: string; state: string };

function normalizeCity(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, "-");
}

function normalizedZip(zip: string): string {
  return zip.trim();
}

export function normalizeLocationQuery(query: LocationQuery): NormalizedLocation {
  const zip = query.zip?.trim();
  const city = query.city?.trim();
  const state = query.state?.trim();

  if (zip && (city || state)) {
    throw new ApiError(
      400,
      "INVALID_QUERY",
      "Provide either zip OR city/state, not both."
    );
  }

  if (zip) {
    if (!/^\d{5}$/.test(zip)) {
      throw new ApiError(400, "INVALID_QUERY", "zip must be a 5-digit string.");
    }
    return { kind: "zip", zip: normalizedZip(zip) };
  }

  if (!city || !state) {
    throw new ApiError(
      400,
      "INVALID_QUERY",
      "city and state are both required when zip is not provided."
    );
  }

  if (!/^[A-Za-z]{2}$/.test(state)) {
    throw new ApiError(400, "INVALID_QUERY", "state must be a 2-letter code.");
  }

  return { kind: "city", city, state: state.toUpperCase() };
}

export function buildLocationKey(query: NormalizedLocation): string {
  if (query.kind === "zip") {
    return `zip:${query.zip}`;
  }

  return `city:${normalizeCity(query.city)}:${query.state}`;
}

export class DemandService {
  private readonly repository: DemandRepository;

  public constructor(repository: DemandRepository) {
    this.repository = repository;
  }

  public async getIndex(query: LocationQuery): Promise<DemandIndexResult> {
    const series = await this.resolveSeries(query);
    this.ensurePointCount(series, 7, "index");

    const latestWindow = this.lastN(series.points.map((p) => p.demand), 7);
    const index = round(mean(latestWindow), 2);

    const allSeries = await this.repository.getAllSeries();
    const allIndices = allSeries
      .filter((item) => item.points.length >= 7)
      .map((item) => round(mean(this.lastN(item.points.map((p) => p.demand), 7)), 2));

    const atOrBelow = allIndices.filter((value) => value <= index).length;
    const percentile = allIndices.length === 0 ? 0 : round((atOrBelow / allIndices.length) * 100, 2);

    return {
      location: this.toLocation(series),
      index,
      percentile,
      sampleSize: latestWindow.length,
      asOf: this.latestPointAt(series)
    };
  }

  public async getTrend(query: LocationQuery): Promise<DemandTrendResult> {
    const series = await this.resolveSeries(query);
    this.ensurePointCount(series, 14, "trend");

    const values = series.points.map((p) => p.demand);
    const current = this.lastN(values, 7);
    const previous = values.slice(values.length - 14, values.length - 7);

    const currentIndex = round(mean(current), 2);
    const previousIndex = round(mean(previous), 2);

    const velocity = round((currentIndex - previousIndex) / Math.max(previousIndex, 1), 4);
    const direction =
      velocity > 0.03 ? "up" : velocity < -0.03 ? "down" : "flat";

    return {
      location: this.toLocation(series),
      velocity,
      direction,
      currentIndex,
      previousIndex,
      asOf: this.latestPointAt(series)
    };
  }

  public async getAnomalies(query: LocationQuery): Promise<DemandAnomaliesResult> {
    const series = await this.resolveSeries(query);
    this.ensurePointCount(series, 29, "anomalies");

    const values = series.points.map((p) => p.demand);
    const latest = values[values.length - 1];
    const history = values.slice(values.length - 29, values.length - 1);
    const recent14 = values.slice(values.length - 14);

    const mu = mean(history);
    const sigma = stdDev(history) || 1;
    const z = (latest - mu) / sigma;

    const weekAgo = values[values.length - 8];
    const cv = stdDev(recent14) / Math.max(mean(recent14), 1);

    const flags = {
      spike: z >= 2,
      drop: z <= -2,
      volatility: cv >= 0.22,
      seasonalityBreak: Math.abs(latest - weekAgo) > sigma * 1.5
    };

    const details: string[] = [];
    if (flags.spike) details.push("Latest demand significantly above baseline.");
    if (flags.drop) details.push("Latest demand significantly below baseline.");
    if (flags.volatility) details.push("Recent short-term volatility exceeded threshold.");
    if (flags.seasonalityBreak) details.push("Deviation from week-over-week seasonal expectation.");
    if (details.length === 0) details.push("No material anomaly detected.");

    const score = round(
      clamp(
        Math.abs(z) * 30 +
          (flags.volatility ? 20 : 0) +
          (flags.seasonalityBreak ? 15 : 0),
        0,
        100
      ),
      2
    );

    return {
      location: this.toLocation(series),
      flags,
      score,
      details,
      asOf: this.latestPointAt(series)
    };
  }

  private async resolveSeries(query: LocationQuery): Promise<DemandSeries> {
    const normalized = normalizeLocationQuery(query);
    const key = buildLocationKey(normalized);
    const series = await this.repository.getSeriesByKey(key);

    if (!series) {
      throw new ApiError(404, "NOT_FOUND", `No demand series found for ${key}.`);
    }

    return series;
  }

  private ensurePointCount(series: DemandSeries, minimum: number, metric: string): void {
    if (series.points.length < minimum) {
      throw new ApiError(
        422,
        "INSUFFICIENT_HISTORY",
        `Not enough points for ${metric} calculation.`,
        { minimum, received: series.points.length }
      );
    }
  }

  private latestPointAt(series: DemandSeries): string {
    const latest = series.points[series.points.length - 1];
    return latest.at;
  }

  private toLocation(series: DemandSeries): DemandLocation {
    return {
      kind: series.kind,
      key: series.key,
      zip: series.zip,
      city: series.city,
      state: series.state
    };
  }

  private lastN(values: number[], n: number): number[] {
    if (values.length <= n) {
      return [...values];
    }

    return values.slice(values.length - n);
  }
}