import { describe, expect, it } from 'bun:test';

import { MockDataProvider } from '../data-provider';
import { handleAnomalies, handleDemandIndex, handleTrend } from '../handlers';
import { createFreshnessMetadata } from '../transforms';

describe('Freshness Metadata Correctness', () => {
  it('dataAsOf reflects actual data timestamp', async () => {
    const provider = new MockDataProvider(new Date('2024-01-15T10:00:00Z'));
    const result = await handleDemandIndex({ geoType: 'zip', geoCode: '94105', lookbackWindow: '30d', seasonalityMode: 'none' }, provider);
    expect(result.freshness.dataAsOf).toBe('2024-01-15T10:00:00.000Z');
  });
  it('computedAt is close to current time', async () => {
    const provider = new MockDataProvider();
    const before = Date.now();
    const result = await handleDemandIndex({ geoType: 'zip', geoCode: '94105', lookbackWindow: '30d', seasonalityMode: 'none' }, provider);
    const after = Date.now();
    const computedAt = new Date(result.freshness.computedAt).getTime();
    expect(computedAt).toBeGreaterThanOrEqual(before);
    expect(computedAt).toBeLessThanOrEqual(after);
  });
  it('staleAfter equals computedAt + ttlSeconds', async () => {
    const provider = new MockDataProvider();
    const result = await handleDemandIndex({ geoType: 'zip', geoCode: '94105', lookbackWindow: '30d', seasonalityMode: 'none' }, provider);
    const computedAt = new Date(result.freshness.computedAt).getTime();
    const staleAfter = new Date(result.freshness.staleAfter).getTime();
    expect(staleAfter).toBe(computedAt + result.freshness.ttlSeconds * 1000);
  });
  it('ttlSeconds is positive', async () => {
    const provider = new MockDataProvider();
    const result = await handleDemandIndex({ geoType: 'zip', geoCode: '94105', lookbackWindow: '30d', seasonalityMode: 'none' }, provider);
    expect(result.freshness.ttlSeconds).toBeGreaterThan(0);
  });
});

describe('Staleness Thresholds', () => {
  it('default TTL is 1 hour (3600 seconds)', () => { expect(createFreshnessMetadata(new Date()).ttlSeconds).toBe(3600); });
  it('custom TTL is respected', () => { expect(createFreshnessMetadata(new Date(), 7200).ttlSeconds).toBe(7200); });
  it('staleAfter is in the future', () => { expect(new Date(createFreshnessMetadata(new Date(), 3600).staleAfter).getTime()).toBeGreaterThan(Date.now()); });
  it('data is considered fresh within TTL window', () => { expect(new Date(createFreshnessMetadata(new Date(), 3600).staleAfter).getTime() > Date.now()).toBe(true); });
});

describe('Confidence Propagation', () => {
  it('confidence interval level is preserved through handlers', async () => {
    const provider = new MockDataProvider();
    const result = await handleDemandIndex({ geoType: 'zip', geoCode: '94105', lookbackWindow: '30d', seasonalityMode: 'none' }, provider);
    expect(result.confidenceInterval.level).toBe(0.95);
  });
  it('confidence interval bounds are ordered correctly', async () => {
    const provider = new MockDataProvider();
    const result = await handleDemandIndex({ geoType: 'zip', geoCode: '94105', lookbackWindow: '30d', seasonalityMode: 'none' }, provider);
    expect(result.confidenceInterval.lower).toBeLessThanOrEqual(result.confidenceInterval.upper);
  });
  it('trend endpoint preserves confidence interval', async () => {
    const provider = new MockDataProvider();
    const result = await handleTrend({ geoType: 'city', geoCode: 'sf', lookbackWindow: '30d', granularity: 'daily' }, provider);
    expect(result.confidenceInterval.level).toBe(0.95);
  });
  it('wider lookback window may affect confidence interval width', async () => {
    const provider = new MockDataProvider();
    const short = await handleDemandIndex({ geoType: 'zip', geoCode: '94105', lookbackWindow: '7d', seasonalityMode: 'none' }, provider);
    const long = await handleDemandIndex({ geoType: 'zip', geoCode: '94105', lookbackWindow: '365d', seasonalityMode: 'none' }, provider);
    expect(short.confidenceInterval.level).toBe(0.95);
    expect(long.confidenceInterval.level).toBe(0.95);
  });
});

describe('Data Quality Guarantees', () => {
  it('demandIndex is within valid range (0-200)', async () => {
    const provider = new MockDataProvider();
    for (const geoCode of ['94105', '10001', '60601', '90210', '33101']) {
      const result = await handleDemandIndex({ geoType: 'zip', geoCode, lookbackWindow: '30d', seasonalityMode: 'none' }, provider);
      expect(result.demandIndex).toBeGreaterThanOrEqual(0);
      expect(result.demandIndex).toBeLessThanOrEqual(200);
    }
  });
  it('trendStrength is within valid range (0-1)', async () => {
    const provider = new MockDataProvider();
    const result = await handleTrend({ geoType: 'zip', geoCode: '94105', lookbackWindow: '90d', granularity: 'daily' }, provider);
    expect(result.trendStrength).toBeGreaterThanOrEqual(0);
    expect(result.trendStrength).toBeLessThanOrEqual(1);
  });
  it('similarity scores are within valid range (0-1)', async () => {
    const provider = new MockDataProvider();
    const result = await handleDemandIndex({ geoType: 'zip', geoCode: '94105', lookbackWindow: '30d', seasonalityMode: 'none' }, provider);
    for (const geo of result.comparableGeos) {
      expect(geo.similarity).toBeGreaterThanOrEqual(0);
      expect(geo.similarity).toBeLessThanOrEqual(1);
    }
  });
  it('anomaly deviationScore is non-negative', async () => {
    const provider = new MockDataProvider();
    const result = await handleAnomalies({ geoType: 'zip', geoCode: '94105', lookbackWindow: '90d', sensitivityThreshold: 1.5 }, provider);
    for (const flag of result.anomalyFlags) { expect(flag.deviationScore).toBeGreaterThanOrEqual(0); }
  });
  it('baseline stats are consistent', async () => {
    const provider = new MockDataProvider();
    const result = await handleAnomalies({ geoType: 'city', geoCode: 'sf', lookbackWindow: '30d', sensitivityThreshold: 2 }, provider);
    expect(result.baselineStats.stdDev).toBeGreaterThanOrEqual(0);
  });
});

describe('Temporal Consistency', () => {
  it('trend data points are chronologically ordered', async () => {
    const provider = new MockDataProvider();
    const result = await handleTrend({ geoType: 'zip', geoCode: '94105', lookbackWindow: '30d', granularity: 'daily' }, provider);
    for (let i = 1; i < result.dataPoints.length; i++) {
      expect(new Date(result.dataPoints[i].date).getTime()).toBeGreaterThan(new Date(result.dataPoints[i - 1].date).getTime());
    }
  });
  it('anomaly detectedAt timestamps are valid ISO strings', async () => {
    const provider = new MockDataProvider();
    const result = await handleAnomalies({ geoType: 'metro', geoCode: 'NYC', lookbackWindow: '90d', sensitivityThreshold: 1.5 }, provider);
    for (const flag of result.anomalyFlags) { expect(new Date(flag.detectedAt).toISOString()).toBe(flag.detectedAt); }
  });
  it('freshness timestamps are valid ISO strings', async () => {
    const provider = new MockDataProvider();
    const result = await handleDemandIndex({ geoType: 'zip', geoCode: '94105', lookbackWindow: '30d', seasonalityMode: 'none' }, provider);
    expect(new Date(result.freshness.dataAsOf).toISOString()).toBe(result.freshness.dataAsOf);
    expect(new Date(result.freshness.computedAt).toISOString()).toBe(result.freshness.computedAt);
    expect(new Date(result.freshness.staleAfter).toISOString()).toBe(result.freshness.staleAfter);
  });
});
