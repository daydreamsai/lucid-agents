import { describe, expect, it } from 'bun:test';

import {
  aggregateTimeSeries, analyzeTrend, calculateBaselineStats, calculateConfidenceInterval,
  calculateDemandIndex, calculateVelocity, createFreshnessMetadata, detectAnomalies,
  filterByLookback, getLookbackMs, getSeasonalFactor, rankComparableGeos, type RawDataPoint,
} from '../transforms';

describe('aggregateTimeSeries', () => {
  it('returns empty array for empty input', () => { expect(aggregateTimeSeries([], 'daily')).toEqual([]); });
  it('aggregates daily data correctly', () => {
    const msPerHour = 60 * 60 * 1000;
    const baseTime = new Date('2024-01-15T00:00:00Z').getTime();
    const data: RawDataPoint[] = [{ timestamp: baseTime, value: 100 }, { timestamp: baseTime + msPerHour, value: 110 }, { timestamp: baseTime + 2 * msPerHour, value: 90 }];
    const result = aggregateTimeSeries(data, 'daily');
    expect(result.length).toBe(1);
    expect(result[0].value).toBe(100);
  });
  it('aggregates weekly data correctly', () => {
    const msPerDay = 24 * 60 * 60 * 1000;
    const baseTime = new Date('2024-01-15T00:00:00Z').getTime();
    const data: RawDataPoint[] = [{ timestamp: baseTime, value: 100 }, { timestamp: baseTime + msPerDay, value: 110 }, { timestamp: baseTime + 7 * msPerDay, value: 120 }];
    expect(aggregateTimeSeries(data, 'weekly').length).toBe(2);
  });
  it('aggregates monthly data correctly', () => {
    const data: RawDataPoint[] = [{ timestamp: new Date('2024-01-15').getTime(), value: 100 }, { timestamp: new Date('2024-01-20').getTime(), value: 110 }, { timestamp: new Date('2024-02-15').getTime(), value: 120 }];
    const result = aggregateTimeSeries(data, 'monthly');
    expect(result.length).toBe(2);
    expect(result[0].value).toBe(105);
  });
});

describe('calculateDemandIndex', () => {
  it('returns 100 for equal current and baseline', () => { expect(calculateDemandIndex({ currentValue: 100, baselineValue: 100, seasonalityMode: 'none' })).toBe(100); });
  it('returns 100 when baseline is zero', () => { expect(calculateDemandIndex({ currentValue: 50, baselineValue: 0, seasonalityMode: 'none' })).toBe(100); });
  it('calculates correct index for higher demand', () => { expect(calculateDemandIndex({ currentValue: 150, baselineValue: 100, seasonalityMode: 'none' })).toBe(150); });
  it('calculates correct index for lower demand', () => { expect(calculateDemandIndex({ currentValue: 50, baselineValue: 100, seasonalityMode: 'none' })).toBe(50); });
  it('applies seasonal adjustment', () => { expect(calculateDemandIndex({ currentValue: 130, baselineValue: 100, seasonalityMode: 'yoy', seasonalFactor: 1.3 })).toBe(100); });
  it('clamps result to 0-200 range', () => {
    expect(calculateDemandIndex({ currentValue: 300, baselineValue: 100, seasonalityMode: 'none' })).toBe(200);
    expect(calculateDemandIndex({ currentValue: -50, baselineValue: 100, seasonalityMode: 'none' })).toBe(0);
  });
});

describe('calculateVelocity', () => {
  it('returns 0 for empty data', () => { expect(calculateVelocity([])).toBe(0); });
  it('returns 0 for single data point', () => { expect(calculateVelocity([{ timestamp: 0, value: 100 }])).toBe(0); });
  it('calculates positive velocity for increasing trend', () => {
    const data: RawDataPoint[] = [{ timestamp: 0, value: 100 }, { timestamp: 1, value: 110 }, { timestamp: 2, value: 120 }, { timestamp: 3, value: 130 }];
    expect(calculateVelocity(data)).toBeGreaterThan(0);
  });
  it('calculates negative velocity for decreasing trend', () => {
    const data: RawDataPoint[] = [{ timestamp: 0, value: 130 }, { timestamp: 1, value: 120 }, { timestamp: 2, value: 110 }, { timestamp: 3, value: 100 }];
    expect(calculateVelocity(data)).toBeLessThan(0);
  });
  it('calculates near-zero velocity for flat trend', () => {
    const data: RawDataPoint[] = [{ timestamp: 0, value: 100 }, { timestamp: 1, value: 100 }, { timestamp: 2, value: 100 }, { timestamp: 3, value: 100 }];
    expect(calculateVelocity(data)).toBe(0);
  });
});

describe('calculateConfidenceInterval', () => {
  it('returns zeros for empty array', () => { expect(calculateConfidenceInterval([], 0.95)).toEqual({ lower: 0, upper: 0, level: 0.95 }); });
  it('calculates correct interval for uniform data', () => {
    const result = calculateConfidenceInterval([100, 100, 100, 100, 100], 0.95);
    expect(result.lower).toBe(100);
    expect(result.upper).toBe(100);
  });
  it('calculates wider interval for variable data', () => {
    const result = calculateConfidenceInterval([80, 90, 100, 110, 120], 0.95);
    expect(result.lower).toBeLessThan(100);
    expect(result.upper).toBeGreaterThan(100);
  });
  it('respects confidence level', () => {
    const values = [80, 90, 100, 110, 120];
    const ci90 = calculateConfidenceInterval(values, 0.90);
    const ci99 = calculateConfidenceInterval(values, 0.99);
    expect(ci99.upper - ci99.lower).toBeGreaterThan(ci90.upper - ci90.lower);
  });
});

describe('analyzeTrend', () => {
  it('returns stable for insufficient data', () => { expect(analyzeTrend([{ timestamp: 0, value: 100 }])).toEqual({ direction: 'stable', strength: 0 }); });
  it('detects rising trend', () => {
    const data: RawDataPoint[] = Array.from({ length: 10 }, (_, i) => ({ timestamp: i, value: 100 + i * 5 }));
    expect(analyzeTrend(data).direction).toBe('rising');
  });
  it('detects falling trend', () => {
    const data: RawDataPoint[] = Array.from({ length: 10 }, (_, i) => ({ timestamp: i, value: 150 - i * 5 }));
    expect(analyzeTrend(data).direction).toBe('falling');
  });
  it('detects stable trend', () => {
    const data: RawDataPoint[] = Array.from({ length: 10 }, (_, i) => ({ timestamp: i, value: 100 + (Math.random() - 0.5) * 0.1 }));
    expect(analyzeTrend(data).direction).toBe('stable');
  });
  it('strength is bounded 0-1', () => {
    const data: RawDataPoint[] = Array.from({ length: 10 }, (_, i) => ({ timestamp: i, value: 100 + i * 100 }));
    const result = analyzeTrend(data);
    expect(result.strength).toBeLessThanOrEqual(1);
    expect(result.strength).toBeGreaterThanOrEqual(0);
  });
});

describe('detectAnomalies', () => {
  it('returns empty for insufficient data', () => { expect(detectAnomalies({ dataPoints: [{ timestamp: 0, value: 100 }], sensitivityThreshold: 2, geoCode: 'TEST' })).toEqual([]); });
  it('detects spike anomaly', () => {
    const data: RawDataPoint[] = [{ timestamp: 0, value: 100 }, { timestamp: 1, value: 100 }, { timestamp: 2, value: 100 }, { timestamp: 3, value: 100 }, { timestamp: 4, value: 200 }];
    expect(detectAnomalies({ dataPoints: data, sensitivityThreshold: 2, geoCode: 'TEST' }).some(a => a.type === 'spike')).toBe(true);
  });
  it('detects drop anomaly', () => {
    const data: RawDataPoint[] = [{ timestamp: 0, value: 100 }, { timestamp: 1, value: 100 }, { timestamp: 2, value: 100 }, { timestamp: 3, value: 100 }, { timestamp: 4, value: 20 }];
    expect(detectAnomalies({ dataPoints: data, sensitivityThreshold: 2, geoCode: 'TEST' }).some(a => a.type === 'drop')).toBe(true);
  });
  it('respects sensitivity threshold', () => {
    const data: RawDataPoint[] = [{ timestamp: 0, value: 100 }, { timestamp: 1, value: 100 }, { timestamp: 2, value: 100 }, { timestamp: 3, value: 100 }, { timestamp: 4, value: 130 }];
    const low = detectAnomalies({ dataPoints: data, sensitivityThreshold: 1, geoCode: 'TEST' });
    const high = detectAnomalies({ dataPoints: data, sensitivityThreshold: 5, geoCode: 'TEST' });
    expect(low.length).toBeGreaterThanOrEqual(high.length);
  });
  it('assigns correct severity based on deviation', () => {
    const data: RawDataPoint[] = [{ timestamp: 0, value: 100 }, { timestamp: 1, value: 100 }, { timestamp: 2, value: 100 }, { timestamp: 3, value: 100 }, { timestamp: 4, value: 500 }];
    const result = detectAnomalies({ dataPoints: data, sensitivityThreshold: 2, geoCode: 'TEST' });
    const spike = result.find(a => a.type === 'spike');
    expect(['low', 'medium', 'high', 'critical']).toContain(spike?.severity);
  });
  it('returns empty for uniform data', () => {
    const data: RawDataPoint[] = Array.from({ length: 10 }, (_, i) => ({ timestamp: i, value: 100 }));
    expect(detectAnomalies({ dataPoints: data, sensitivityThreshold: 2, geoCode: 'TEST' })).toEqual([]);
  });
});

describe('calculateBaselineStats', () => {
  it('returns zeros for empty array', () => { expect(calculateBaselineStats([])).toEqual({ mean: 0, stdDev: 0, median: 0 }); });
  it('calculates correct stats for single value', () => { expect(calculateBaselineStats([100])).toEqual({ mean: 100, stdDev: 0, median: 100 }); });
  it('calculates correct mean', () => { expect(calculateBaselineStats([80, 90, 100, 110, 120]).mean).toBe(100); });
  it('calculates correct median for odd count', () => { expect(calculateBaselineStats([80, 90, 100, 110, 120]).median).toBe(100); });
  it('calculates correct median for even count', () => { expect(calculateBaselineStats([80, 90, 110, 120]).median).toBe(100); });
  it('calculates correct stdDev', () => { expect(calculateBaselineStats([90, 100, 110]).stdDev).toBeCloseTo(8.16, 1); });
});

describe('rankComparableGeos', () => {
  it('returns empty for empty candidates', () => { expect(rankComparableGeos(100, [])).toEqual([]); });
  it('ranks by similarity (closest first)', () => {
    const candidates = [{ geoCode: 'A', demandIndex: 150 }, { geoCode: 'B', demandIndex: 105 }, { geoCode: 'C', demandIndex: 80 }];
    const result = rankComparableGeos(100, candidates);
    expect(result[0].geoCode).toBe('B');
  });
  it('limits to 5 results', () => {
    const candidates = Array.from({ length: 10 }, (_, i) => ({ geoCode: `GEO-${i}`, demandIndex: 100 + i }));
    expect(rankComparableGeos(100, candidates).length).toBe(5);
  });
  it('calculates similarity correctly', () => { expect(rankComparableGeos(100, [{ geoCode: 'A', demandIndex: 100 }])[0].similarity).toBe(1); });
  it('similarity decreases with distance', () => {
    const result = rankComparableGeos(100, [{ geoCode: 'A', demandIndex: 100 }, { geoCode: 'B', demandIndex: 150 }]);
    expect(result[0].similarity).toBeGreaterThan(result[1].similarity);
  });
});

describe('createFreshnessMetadata', () => {
  it('creates valid freshness metadata', () => {
    const result = createFreshnessMetadata(new Date('2024-01-15T10:00:00Z'), 3600);
    expect(result.dataAsOf).toBe('2024-01-15T10:00:00.000Z');
    expect(result.ttlSeconds).toBe(3600);
  });
  it('uses default TTL of 3600', () => { expect(createFreshnessMetadata(new Date()).ttlSeconds).toBe(3600); });
});

describe('getSeasonalFactor', () => {
  it('returns 1 for none mode', () => { expect(getSeasonalFactor(new Date('2024-12-15'), 'none')).toBe(1); });
  it('returns higher factor for December', () => { expect(getSeasonalFactor(new Date('2024-12-15'), 'yoy')).toBeGreaterThan(getSeasonalFactor(new Date('2024-04-15'), 'yoy')); });
  it('returns lower factor for January', () => { expect(getSeasonalFactor(new Date('2024-01-15'), 'yoy')).toBeLessThan(1); });
  it('uses historical factors when provided', () => { expect(getSeasonalFactor(new Date('2024-12-15'), 'yoy', new Map([['month-11', 2.0]]))).toBe(2.0); });
});

describe('getLookbackMs', () => {
  it('returns correct milliseconds for each window', () => {
    const msPerDay = 24 * 60 * 60 * 1000;
    expect(getLookbackMs('7d')).toBe(7 * msPerDay);
    expect(getLookbackMs('30d')).toBe(30 * msPerDay);
    expect(getLookbackMs('90d')).toBe(90 * msPerDay);
    expect(getLookbackMs('365d')).toBe(365 * msPerDay);
  });
});

describe('filterByLookback', () => {
  it('filters data points by lookback window', () => {
    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;
    const data: RawDataPoint[] = [{ timestamp: now - 5 * msPerDay, value: 100 }, { timestamp: now - 10 * msPerDay, value: 90 }, { timestamp: now - 40 * msPerDay, value: 80 }];
    expect(filterByLookback(data, '7d', now).length).toBe(1);
  });
  it('returns all data within window', () => {
    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;
    const data: RawDataPoint[] = [{ timestamp: now - 1 * msPerDay, value: 100 }, { timestamp: now - 2 * msPerDay, value: 90 }, { timestamp: now - 3 * msPerDay, value: 80 }];
    expect(filterByLookback(data, '7d', now).length).toBe(3);
  });
  it('returns empty for all data outside window', () => {
    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;
    expect(filterByLookback([{ timestamp: now - 100 * msPerDay, value: 100 }], '7d', now).length).toBe(0);
  });
});
