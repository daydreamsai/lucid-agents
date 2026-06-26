import { describe, expect, it } from 'bun:test';

import { MockDataProvider } from '../data-provider';
import { DemandDataError,handleAnomalies, handleDemandIndex, handleTrend } from '../handlers';

describe('handleDemandIndex', () => {
  const provider = new MockDataProvider(new Date('2024-06-15T12:00:00Z'));

  it('returns valid demand index response', async () => {
    const result = await handleDemandIndex({ geoType: 'zip', geoCode: '94105', lookbackWindow: '30d', seasonalityMode: 'auto' }, provider);
    expect(result.geoType).toBe('zip');
    expect(result.geoCode).toBe('94105');
    expect(result.demandIndex).toBeGreaterThanOrEqual(0);
    expect(result.demandIndex).toBeLessThanOrEqual(200);
    expect(typeof result.velocity).toBe('number');
    expect(result.confidenceInterval.level).toBe(0.95);
  });

  it('includes category when provided', async () => {
    const result = await handleDemandIndex({ geoType: 'city', geoCode: 'sf', category: 'electronics', lookbackWindow: '30d', seasonalityMode: 'none' }, provider);
    expect(result.category).toBe('electronics');
  });

  it('returns null category when not provided', async () => {
    const result = await handleDemandIndex({ geoType: 'zip', geoCode: '94105', lookbackWindow: '30d', seasonalityMode: 'none' }, provider);
    expect(result.category).toBeNull();
  });

  it('returns comparable geos ranked by similarity', async () => {
    const result = await handleDemandIndex({ geoType: 'zip', geoCode: '94105', lookbackWindow: '30d', seasonalityMode: 'none' }, provider);
    expect(result.comparableGeos.length).toBeGreaterThan(0);
    expect(result.comparableGeos.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < result.comparableGeos.length; i++) {
      expect(result.comparableGeos[i - 1].similarity).toBeGreaterThanOrEqual(result.comparableGeos[i].similarity);
    }
  });

  it('includes freshness metadata', async () => {
    const result = await handleDemandIndex({ geoType: 'zip', geoCode: '94105', lookbackWindow: '30d', seasonalityMode: 'none' }, provider);
    expect(result.freshness.dataAsOf).toBe('2024-06-15T12:00:00.000Z');
    expect(result.freshness.ttlSeconds).toBe(3600);
  });

  it('handles different lookback windows', async () => {
    for (const window of ['7d', '30d', '90d', '365d'] as const) {
      const result = await handleDemandIndex({ geoType: 'zip', geoCode: '94105', lookbackWindow: window, seasonalityMode: 'none' }, provider);
      expect(result.demandIndex).toBeDefined();
    }
  });

  it('handles different geo types', async () => {
    for (const geoType of ['zip', 'city', 'county', 'state', 'metro'] as const) {
      const result = await handleDemandIndex({ geoType, geoCode: 'TEST-123', lookbackWindow: '30d', seasonalityMode: 'none' }, provider);
      expect(result.geoType).toBe(geoType);
    }
  });
});

describe('handleTrend', () => {
  const provider = new MockDataProvider(new Date('2024-06-15T12:00:00Z'));

  it('returns valid trend response', async () => {
    const result = await handleTrend({ geoType: 'zip', geoCode: '94105', lookbackWindow: '30d', granularity: 'daily' }, provider);
    expect(result.geoType).toBe('zip');
    expect(['rising', 'falling', 'stable']).toContain(result.trendDirection);
    expect(result.trendStrength).toBeGreaterThanOrEqual(0);
    expect(result.trendStrength).toBeLessThanOrEqual(1);
  });

  it('returns data points with correct structure', async () => {
    const result = await handleTrend({ geoType: 'city', geoCode: 'sf', lookbackWindow: '30d', granularity: 'daily' }, provider);
    expect(result.dataPoints.length).toBeGreaterThan(0);
    for (const point of result.dataPoints) {
      expect(point.date).toBeDefined();
      expect(typeof point.demandIndex).toBe('number');
      expect(typeof point.velocity).toBe('number');
    }
  });

  it('aggregates by granularity', async () => {
    const daily = await handleTrend({ geoType: 'zip', geoCode: '94105', lookbackWindow: '30d', granularity: 'daily' }, provider);
    const weekly = await handleTrend({ geoType: 'zip', geoCode: '94105', lookbackWindow: '30d', granularity: 'weekly' }, provider);
    expect(weekly.dataPoints.length).toBeLessThan(daily.dataPoints.length);
  });

  it('includes category when provided', async () => {
    const result = await handleTrend({ geoType: 'zip', geoCode: '94105', category: 'groceries', lookbackWindow: '30d', granularity: 'daily' }, provider);
    expect(result.category).toBe('groceries');
  });
});

describe('handleAnomalies', () => {
  const provider = new MockDataProvider(new Date('2024-06-15T12:00:00Z'));

  it('returns valid anomalies response', async () => {
    const result = await handleAnomalies({ geoType: 'zip', geoCode: '94105', lookbackWindow: '30d', sensitivityThreshold: 2 }, provider);
    expect(result.geoType).toBe('zip');
    expect(result.anomalyFlags).toBeInstanceOf(Array);
    expect(result.anomalyCount).toBe(result.anomalyFlags.length);
  });

  it('returns baseline statistics', async () => {
    const result = await handleAnomalies({ geoType: 'city', geoCode: 'sf', lookbackWindow: '30d', sensitivityThreshold: 2 }, provider);
    expect(typeof result.baselineStats.mean).toBe('number');
    expect(typeof result.baselineStats.stdDev).toBe('number');
    expect(typeof result.baselineStats.median).toBe('number');
  });

  it('anomaly flags have correct structure', async () => {
    const result = await handleAnomalies({ geoType: 'metro', geoCode: 'NYC', lookbackWindow: '90d', sensitivityThreshold: 1.5 }, provider);
    for (const flag of result.anomalyFlags) {
      expect(['spike', 'drop', 'volatility', 'trend_break']).toContain(flag.type);
      expect(['low', 'medium', 'high', 'critical']).toContain(flag.severity);
      expect(flag.detectedAt).toBeDefined();
      expect(typeof flag.deviationScore).toBe('number');
    }
  });

  it('respects sensitivity threshold', async () => {
    const low = await handleAnomalies({ geoType: 'zip', geoCode: '94105', lookbackWindow: '90d', sensitivityThreshold: 1 }, provider);
    const high = await handleAnomalies({ geoType: 'zip', geoCode: '94105', lookbackWindow: '90d', sensitivityThreshold: 4 }, provider);
    expect(low.anomalyCount).toBeGreaterThanOrEqual(high.anomalyCount);
  });

  it('includes category when provided', async () => {
    const result = await handleAnomalies({ geoType: 'zip', geoCode: '94105', category: 'apparel', lookbackWindow: '30d', sensitivityThreshold: 2 }, provider);
    expect(result.category).toBe('apparel');
  });
});

describe('DemandDataError', () => {
  it('creates error with correct properties', () => {
    const error = new DemandDataError('INVALID_GEO_CODE', 'Invalid geo code', { geoCode: 'INVALID' });
    expect(error.code).toBe('INVALID_GEO_CODE');
    expect(error.message).toBe('Invalid geo code');
    expect(error.details).toEqual({ geoCode: 'INVALID' });
  });

  it('converts to error envelope', () => {
    const error = new DemandDataError('DATA_NOT_AVAILABLE', 'No data');
    const envelope = error.toErrorEnvelope();
    expect(envelope.error.code).toBe('DATA_NOT_AVAILABLE');
    expect(envelope.error.message).toBe('No data');
  });
});
