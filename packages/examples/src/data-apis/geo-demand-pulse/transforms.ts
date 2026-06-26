/**
 * Geo Demand Pulse Index - Business Logic Transforms
 *
 * Pure functions for data transformation, scoring, and ranking.
 * No side effects - all functions are deterministic given the same inputs.
 */
import type {
  AnomalyFlag,
  ConfidenceInterval,
  FreshnessMetadata,
  LookbackWindow,
  SeasonalityMode,
} from './schemas';

// ============================================================================
// Time Series Aggregation
// ============================================================================

export interface RawDataPoint {
  timestamp: number;
  value: number;
}

export function aggregateTimeSeries(
  data: RawDataPoint[],
  granularity: 'daily' | 'weekly' | 'monthly'
): RawDataPoint[] {
  if (data.length === 0) return [];

  const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp);
  const buckets = new Map<number, number[]>();

  for (const point of sorted) {
    const bucketKey = getBucketKey(point.timestamp, granularity);
    const existing = buckets.get(bucketKey) || [];
    existing.push(point.value);
    buckets.set(bucketKey, existing);
  }

  return Array.from(buckets.entries())
    .map(([timestamp, values]) => ({
      timestamp,
      value: values.reduce((a, b) => a + b, 0) / values.length,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

function getBucketKey(
  timestamp: number,
  granularity: 'daily' | 'weekly' | 'monthly'
): number {
  const date = new Date(timestamp);
  switch (granularity) {
    case 'daily':
      return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    case 'weekly': {
      const day = date.getDay();
      const diff = date.getDate() - day;
      return new Date(date.getFullYear(), date.getMonth(), diff).getTime();
    }
    case 'monthly':
      return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
  }
}

// ============================================================================
// Demand Index Calculation
// ============================================================================

export interface DemandIndexParams {
  currentValue: number;
  baselineValue: number;
  seasonalityMode: SeasonalityMode;
  seasonalFactor?: number;
}

export function calculateDemandIndex(params: DemandIndexParams): number {
  const { currentValue, baselineValue, seasonalityMode, seasonalFactor = 1 } = params;

  if (baselineValue === 0) return 100;

  let adjustedCurrent = currentValue;
  if (seasonalityMode !== 'none' && seasonalFactor !== 1) {
    adjustedCurrent = currentValue / seasonalFactor;
  }

  const index = (adjustedCurrent / baselineValue) * 100;
  return Math.max(0, Math.min(200, Math.round(index * 100) / 100));
}

// ============================================================================
// Velocity Calculation
// ============================================================================

export function calculateVelocity(dataPoints: RawDataPoint[]): number {
  if (dataPoints.length < 2) return 0;

  const sorted = [...dataPoints].sort((a, b) => a.timestamp - b.timestamp);
  const n = sorted.length;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += sorted[i].value;
    sumXY += i * sorted[i].value;
    sumX2 += i * i;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  return Math.round(slope * 1000) / 1000;
}

// ============================================================================
// Confidence Interval Calculation
// ============================================================================

export function calculateConfidenceInterval(
  values: number[],
  level: number = 0.95
): ConfidenceInterval {
  if (values.length === 0) {
    return { lower: 0, upper: 0, level };
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  const zScores: Record<number, number> = { 0.90: 1.645, 0.95: 1.96, 0.99: 2.576 };
  const z = zScores[level] || 1.96;

  const margin = z * (stdDev / Math.sqrt(values.length));

  return {
    lower: Math.round((mean - margin) * 100) / 100,
    upper: Math.round((mean + margin) * 100) / 100,
    level,
  };
}

// ============================================================================
// Trend Analysis
// ============================================================================

export type TrendDirection = 'rising' | 'falling' | 'stable';

export interface TrendAnalysis {
  direction: TrendDirection;
  strength: number;
}

export function analyzeTrend(dataPoints: RawDataPoint[]): TrendAnalysis {
  if (dataPoints.length < 3) {
    return { direction: 'stable', strength: 0 };
  }

  const velocity = calculateVelocity(dataPoints);
  const values = dataPoints.map(d => d.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const normalizedVelocity = mean !== 0 ? velocity / mean : 0;

  let direction: TrendDirection;
  if (normalizedVelocity > 0.01) {
    direction = 'rising';
  } else if (normalizedVelocity < -0.01) {
    direction = 'falling';
  } else {
    direction = 'stable';
  }

  const strength = Math.min(1, Math.abs(normalizedVelocity) * 10);

  return { direction, strength: Math.round(strength * 100) / 100 };
}

// ============================================================================
// Anomaly Detection
// ============================================================================

export interface AnomalyDetectionParams {
  dataPoints: RawDataPoint[];
  sensitivityThreshold: number;
  geoCode: string;
}

export function detectAnomalies(params: AnomalyDetectionParams): AnomalyFlag[] {
  const { dataPoints, sensitivityThreshold, geoCode } = params;

  if (dataPoints.length < 5) return [];

  const values = dataPoints.map(d => d.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return [];

  const anomalies: AnomalyFlag[] = [];
  const sorted = [...dataPoints].sort((a, b) => a.timestamp - b.timestamp);

  for (let i = 0; i < sorted.length; i++) {
    const point = sorted[i];
    const zScore = (point.value - mean) / stdDev;
    const absZScore = Math.abs(zScore);

    if (absZScore >= sensitivityThreshold) {
      const severity = getSeverity(absZScore);
      const type = zScore > 0 ? 'spike' : 'drop';

      anomalies.push({
        type,
        severity,
        detectedAt: new Date(point.timestamp).toISOString(),
        description: `${type === 'spike' ? 'Unusual increase' : 'Unusual decrease'} in demand for ${geoCode}`,
        affectedMetric: 'demandIndex',
        deviationScore: Math.round(absZScore * 100) / 100,
      });
    }

    if (i >= 4) {
      const recentValues = sorted.slice(i - 4, i + 1).map(d => d.value);
      const recentVariance = calculateVariance(recentValues);
      const recentVolatility = Math.sqrt(recentVariance) / mean;

      if (recentVolatility > 0.3 && !anomalies.some(a => a.type === 'volatility')) {
        anomalies.push({
          type: 'volatility',
          severity: recentVolatility > 0.5 ? 'high' : 'medium',
          detectedAt: new Date(point.timestamp).toISOString(),
          description: `High volatility detected in demand for ${geoCode}`,
          affectedMetric: 'demandIndex',
          deviationScore: Math.round(recentVolatility * 100) / 100,
        });
      }
    }
  }

  return anomalies;
}

function getSeverity(zScore: number): 'low' | 'medium' | 'high' | 'critical' {
  if (zScore >= 4) return 'critical';
  if (zScore >= 3) return 'high';
  if (zScore >= 2.5) return 'medium';
  return 'low';
}

function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
}

// ============================================================================
// Baseline Statistics
// ============================================================================

export interface BaselineStats {
  mean: number;
  stdDev: number;
  median: number;
}

export function calculateBaselineStats(values: number[]): BaselineStats {
  if (values.length === 0) {
    return { mean: 0, stdDev: 0, median: 0 };
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;

  return {
    mean: Math.round(mean * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
    median: Math.round(median * 100) / 100,
  };
}

// ============================================================================
// Comparable Geos Ranking
// ============================================================================

export interface GeoSimilarity {
  geoCode: string;
  demandIndex: number;
  similarity: number;
}

export function rankComparableGeos(
  targetIndex: number,
  candidates: Array<{ geoCode: string; demandIndex: number }>
): GeoSimilarity[] {
  return candidates
    .map(c => ({
      geoCode: c.geoCode,
      demandIndex: c.demandIndex,
      similarity: calculateSimilarity(targetIndex, c.demandIndex),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);
}

function calculateSimilarity(a: number, b: number): number {
  const maxDiff = 100;
  const diff = Math.abs(a - b);
  const similarity = Math.max(0, 1 - diff / maxDiff);
  return Math.round(similarity * 100) / 100;
}

// ============================================================================
// Freshness Metadata
// ============================================================================

export function createFreshnessMetadata(
  dataAsOf: Date,
  ttlSeconds: number = 3600
): FreshnessMetadata {
  const now = new Date();
  const staleAfter = new Date(now.getTime() + ttlSeconds * 1000);

  return {
    dataAsOf: dataAsOf.toISOString(),
    computedAt: now.toISOString(),
    staleAfter: staleAfter.toISOString(),
    ttlSeconds,
  };
}

// ============================================================================
// Seasonality Adjustment
// ============================================================================

export function getSeasonalFactor(
  date: Date,
  mode: SeasonalityMode,
  historicalFactors?: Map<string, number>
): number {
  if (mode === 'none') return 1;

  const month = date.getMonth();
  const key = `month-${month}`;

  if (historicalFactors?.has(key)) {
    return historicalFactors.get(key)!;
  }

  const defaultFactors: Record<number, number> = {
    0: 0.85, 1: 0.90, 2: 0.95, 3: 1.00, 4: 1.00, 5: 0.95,
    6: 0.90, 7: 0.95, 8: 1.00, 9: 1.05, 10: 1.15, 11: 1.30,
  };

  return defaultFactors[month] || 1;
}

// ============================================================================
// Lookback Window Helpers
// ============================================================================

export function getLookbackMs(window: LookbackWindow): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  switch (window) {
    case '7d': return 7 * msPerDay;
    case '30d': return 30 * msPerDay;
    case '90d': return 90 * msPerDay;
    case '365d': return 365 * msPerDay;
  }
}

export function filterByLookback(
  dataPoints: RawDataPoint[],
  window: LookbackWindow,
  referenceTime: number = Date.now()
): RawDataPoint[] {
  const cutoff = referenceTime - getLookbackMs(window);
  return dataPoints.filter(d => d.timestamp >= cutoff);
}
