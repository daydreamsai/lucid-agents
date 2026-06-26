/**
 * Geo Demand Pulse Index - Request Handlers
 */
import type { DataProvider } from './data-provider';
import { getDataProvider } from './data-provider';
import type { AnomaliesInput, AnomaliesOutput, DemandIndexInput, DemandIndexOutput, TrendInput, TrendOutput } from './schemas';
import {
aggregateTimeSeries,
  analyzeTrend, calculateBaselineStats, calculateConfidenceInterval, calculateDemandIndex,
  calculateVelocity, createFreshnessMetadata, detectAnomalies, filterByLookback,
  getSeasonalFactor, rankComparableGeos, } from './transforms';

export async function handleDemandIndex(
  input: DemandIndexInput,
  provider: DataProvider = getDataProvider()
): Promise<DemandIndexOutput> {
  const { geoType, geoCode, category, lookbackWindow, seasonalityMode } = input;

  const rawData = await provider.getDemandData({ geoType, geoCode, category, lookbackWindow });
  const filteredData = filterByLookback(rawData, lookbackWindow);

  if (filteredData.length === 0) {
    throw new DemandDataError('DATA_NOT_AVAILABLE', `No data available for ${geoType}:${geoCode}`);
  }

  const midpoint = Math.floor(filteredData.length / 2);
  const baselineData = filteredData.slice(0, midpoint);
  const currentData = filteredData.slice(midpoint);

  const baselineValue = baselineData.length > 0
    ? baselineData.reduce((sum, d) => sum + d.value, 0) / baselineData.length : 100;
  const currentValue = currentData.length > 0
    ? currentData.reduce((sum, d) => sum + d.value, 0) / currentData.length : baselineValue;

  const seasonalFactor = getSeasonalFactor(provider.getDataTimestamp(), seasonalityMode);
  const demandIndex = calculateDemandIndex({ currentValue, baselineValue, seasonalityMode, seasonalFactor });
  const velocity = calculateVelocity(filteredData);
  const values = filteredData.map(d => d.value);
  const confidenceInterval = calculateConfidenceInterval(values, 0.95);

  const comparableCandidates = await provider.getComparableGeos({ geoType, geoCode, category });
  const comparableGeos = rankComparableGeos(demandIndex, comparableCandidates);
  const freshness = createFreshnessMetadata(provider.getDataTimestamp(), 3600);

  return { geoType, geoCode, category: category || null, demandIndex, velocity, confidenceInterval, comparableGeos, freshness };
}

export async function handleTrend(
  input: TrendInput,
  provider: DataProvider = getDataProvider()
): Promise<TrendOutput> {
  const { geoType, geoCode, category, lookbackWindow, granularity } = input;

  const rawData = await provider.getDemandData({ geoType, geoCode, category, lookbackWindow });
  const filteredData = filterByLookback(rawData, lookbackWindow);

  if (filteredData.length === 0) {
    throw new DemandDataError('DATA_NOT_AVAILABLE', `No data available for ${geoType}:${geoCode}`);
  }

  const aggregatedData = aggregateTimeSeries(filteredData, granularity);
  const { direction, strength } = analyzeTrend(aggregatedData);

  const dataPoints = aggregatedData.map(d => ({
    date: new Date(d.timestamp).toISOString(),
    demandIndex: calculateDemandIndex({ currentValue: d.value, baselineValue: 100, seasonalityMode: 'none' }),
    velocity: 0,
  }));

  for (let i = 1; i < dataPoints.length; i++) {
    const window = aggregatedData.slice(Math.max(0, i - 3), i + 1);
    dataPoints[i].velocity = calculateVelocity(window);
  }

  const values = aggregatedData.map(d => d.value);
  const confidenceInterval = calculateConfidenceInterval(values, 0.95);
  const freshness = createFreshnessMetadata(provider.getDataTimestamp(), 3600);

  return { geoType, geoCode, category: category || null, trendDirection: direction, trendStrength: strength, dataPoints, confidenceInterval, freshness };
}

export async function handleAnomalies(
  input: AnomaliesInput,
  provider: DataProvider = getDataProvider()
): Promise<AnomaliesOutput> {
  const { geoType, geoCode, category, lookbackWindow, sensitivityThreshold } = input;

  const rawData = await provider.getDemandData({ geoType, geoCode, category, lookbackWindow });
  const filteredData = filterByLookback(rawData, lookbackWindow);

  if (filteredData.length === 0) {
    throw new DemandDataError('DATA_NOT_AVAILABLE', `No data available for ${geoType}:${geoCode}`);
  }

  const anomalyFlags = detectAnomalies({ dataPoints: filteredData, sensitivityThreshold, geoCode });
  const values = filteredData.map(d => d.value);
  const baselineStats = calculateBaselineStats(values);
  const freshness = createFreshnessMetadata(provider.getDataTimestamp(), 3600);

  return { geoType, geoCode, category: category || null, anomalyFlags, anomalyCount: anomalyFlags.length, baselineStats, freshness };
}

export type DemandErrorCode = 'INVALID_GEO_CODE' | 'INVALID_GEO_TYPE' | 'INVALID_CATEGORY' | 'INVALID_LOOKBACK_WINDOW' | 'DATA_NOT_AVAILABLE' | 'DATA_STALE' | 'RATE_LIMITED' | 'PAYMENT_REQUIRED' | 'INTERNAL_ERROR';

export class DemandDataError extends Error {
  constructor(public readonly code: DemandErrorCode, message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'DemandDataError';
  }

  toErrorEnvelope() {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}
