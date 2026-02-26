import { describe, expect, it } from 'bun:test';

import {
  AnomaliesInputSchema, AnomaliesOutputSchema, AnomalyFlagSchema, ConfidenceIntervalSchema,
  DemandIndexInputSchema, DemandIndexOutputSchema, ErrorEnvelopeSchema, FreshnessMetadataSchema,
  GeoTypeSchema, LookbackWindowSchema, SeasonalityModeSchema, TrendInputSchema, TrendOutputSchema,
} from '../schemas';

describe('GeoTypeSchema', () => {
  it('accepts valid geo types', () => {
    expect(GeoTypeSchema.parse('zip')).toBe('zip');
    expect(GeoTypeSchema.parse('city')).toBe('city');
    expect(GeoTypeSchema.parse('county')).toBe('county');
    expect(GeoTypeSchema.parse('state')).toBe('state');
    expect(GeoTypeSchema.parse('metro')).toBe('metro');
  });
  it('rejects invalid geo types', () => {
    expect(() => GeoTypeSchema.parse('invalid')).toThrow();
    expect(() => GeoTypeSchema.parse('')).toThrow();
  });
});

describe('SeasonalityModeSchema', () => {
  it('accepts valid seasonality modes', () => {
    expect(SeasonalityModeSchema.parse('none')).toBe('none');
    expect(SeasonalityModeSchema.parse('yoy')).toBe('yoy');
    expect(SeasonalityModeSchema.parse('mom')).toBe('mom');
    expect(SeasonalityModeSchema.parse('auto')).toBe('auto');
  });
  it('rejects invalid seasonality modes', () => {
    expect(() => SeasonalityModeSchema.parse('weekly')).toThrow();
  });
});

describe('LookbackWindowSchema', () => {
  it('accepts valid lookback windows', () => {
    expect(LookbackWindowSchema.parse('7d')).toBe('7d');
    expect(LookbackWindowSchema.parse('30d')).toBe('30d');
    expect(LookbackWindowSchema.parse('90d')).toBe('90d');
    expect(LookbackWindowSchema.parse('365d')).toBe('365d');
  });
  it('rejects invalid lookback windows', () => {
    expect(() => LookbackWindowSchema.parse('14d')).toThrow();
  });
});

describe('ConfidenceIntervalSchema', () => {
  it('accepts valid confidence intervals', () => {
    expect(ConfidenceIntervalSchema.parse({ lower: 90, upper: 110, level: 0.95 })).toEqual({ lower: 90, upper: 110, level: 0.95 });
  });
  it('rejects level outside 0-1 range', () => {
    expect(() => ConfidenceIntervalSchema.parse({ lower: 90, upper: 110, level: 1.5 })).toThrow();
    expect(() => ConfidenceIntervalSchema.parse({ lower: 90, upper: 110, level: -0.1 })).toThrow();
  });
});

describe('FreshnessMetadataSchema', () => {
  it('accepts valid freshness metadata', () => {
    const valid = { dataAsOf: '2024-01-15T10:00:00.000Z', computedAt: '2024-01-15T10:05:00.000Z', staleAfter: '2024-01-15T11:05:00.000Z', ttlSeconds: 3600 };
    expect(FreshnessMetadataSchema.parse(valid)).toEqual(valid);
  });
  it('rejects invalid datetime formats', () => {
    expect(() => FreshnessMetadataSchema.parse({ dataAsOf: 'not-a-date', computedAt: '2024-01-15T10:05:00.000Z', staleAfter: '2024-01-15T11:05:00.000Z', ttlSeconds: 3600 })).toThrow();
  });
  it('rejects non-positive ttlSeconds', () => {
    expect(() => FreshnessMetadataSchema.parse({ dataAsOf: '2024-01-15T10:00:00.000Z', computedAt: '2024-01-15T10:05:00.000Z', staleAfter: '2024-01-15T11:05:00.000Z', ttlSeconds: 0 })).toThrow();
  });
});

describe('DemandIndexInputSchema', () => {
  it('accepts valid input with all fields', () => {
    const input = { geoType: 'zip', geoCode: '94105', category: 'electronics', lookbackWindow: '30d', seasonalityMode: 'auto' };
    expect(DemandIndexInputSchema.parse(input)).toEqual(input);
  });
  it('applies defaults for optional fields', () => {
    const parsed = DemandIndexInputSchema.parse({ geoType: 'zip', geoCode: '94105' });
    expect(parsed.lookbackWindow).toBe('30d');
    expect(parsed.seasonalityMode).toBe('auto');
  });
  it('rejects empty geoCode', () => {
    expect(() => DemandIndexInputSchema.parse({ geoType: 'zip', geoCode: '' })).toThrow();
  });
  it('rejects geoCode exceeding max length', () => {
    expect(() => DemandIndexInputSchema.parse({ geoType: 'zip', geoCode: 'a'.repeat(51) })).toThrow();
  });
});

describe('DemandIndexOutputSchema', () => {
  const validOutput = {
    geoType: 'zip', geoCode: '94105', category: 'electronics', demandIndex: 105.5, velocity: 0.023,
    confidenceInterval: { lower: 100, upper: 111, level: 0.95 },
    comparableGeos: [{ geoCode: '94107', demandIndex: 102.3, similarity: 0.92 }],
    freshness: { dataAsOf: '2024-01-15T10:00:00.000Z', computedAt: '2024-01-15T10:05:00.000Z', staleAfter: '2024-01-15T11:05:00.000Z', ttlSeconds: 3600 },
  };
  it('accepts valid output', () => { expect(DemandIndexOutputSchema.parse(validOutput)).toEqual(validOutput); });
  it('accepts null category', () => { expect(DemandIndexOutputSchema.parse({ ...validOutput, category: null }).category).toBeNull(); });
  it('rejects demandIndex outside 0-200 range', () => {
    expect(() => DemandIndexOutputSchema.parse({ ...validOutput, demandIndex: -1 })).toThrow();
    expect(() => DemandIndexOutputSchema.parse({ ...validOutput, demandIndex: 201 })).toThrow();
  });
  it('rejects similarity outside 0-1 range', () => {
    expect(() => DemandIndexOutputSchema.parse({ ...validOutput, comparableGeos: [{ geoCode: '94107', demandIndex: 100, similarity: 1.5 }] })).toThrow();
  });
});

describe('TrendInputSchema', () => {
  it('accepts valid input', () => { expect(TrendInputSchema.parse({ geoType: 'city', geoCode: 'sf', lookbackWindow: '90d', granularity: 'weekly' })).toBeDefined(); });
  it('applies default granularity', () => { expect(TrendInputSchema.parse({ geoType: 'city', geoCode: 'sf' }).granularity).toBe('daily'); });
});

describe('TrendOutputSchema', () => {
  const validOutput = {
    geoType: 'city', geoCode: 'sf', category: null, trendDirection: 'rising', trendStrength: 0.75,
    dataPoints: [{ date: '2024-01-01T00:00:00.000Z', demandIndex: 100, velocity: 0 }],
    confidenceInterval: { lower: 98, upper: 106, level: 0.95 },
    freshness: { dataAsOf: '2024-01-15T10:00:00.000Z', computedAt: '2024-01-15T10:05:00.000Z', staleAfter: '2024-01-15T11:05:00.000Z', ttlSeconds: 3600 },
  };
  it('accepts valid output', () => { expect(TrendOutputSchema.parse(validOutput)).toEqual(validOutput); });
  it('rejects invalid trend direction', () => { expect(() => TrendOutputSchema.parse({ ...validOutput, trendDirection: 'sideways' })).toThrow(); });
  it('rejects trendStrength outside 0-1 range', () => {
    expect(() => TrendOutputSchema.parse({ ...validOutput, trendStrength: -0.1 })).toThrow();
    expect(() => TrendOutputSchema.parse({ ...validOutput, trendStrength: 1.1 })).toThrow();
  });
});

describe('AnomaliesInputSchema', () => {
  it('accepts valid input', () => { expect(AnomaliesInputSchema.parse({ geoType: 'metro', geoCode: 'NYC', sensitivityThreshold: 2.5 })).toBeDefined(); });
  it('applies default sensitivityThreshold', () => { expect(AnomaliesInputSchema.parse({ geoType: 'metro', geoCode: 'NYC' }).sensitivityThreshold).toBe(2); });
  it('rejects sensitivityThreshold outside 1-5 range', () => {
    expect(() => AnomaliesInputSchema.parse({ geoType: 'metro', geoCode: 'NYC', sensitivityThreshold: 0.5 })).toThrow();
    expect(() => AnomaliesInputSchema.parse({ geoType: 'metro', geoCode: 'NYC', sensitivityThreshold: 6 })).toThrow();
  });
});

describe('AnomalyFlagSchema', () => {
  it('accepts valid anomaly flag', () => {
    expect(AnomalyFlagSchema.parse({ type: 'spike', severity: 'high', detectedAt: '2024-01-15T10:00:00.000Z', description: 'Test', affectedMetric: 'demandIndex', deviationScore: 3.2 })).toBeDefined();
  });
  it('rejects invalid anomaly type', () => { expect(() => AnomalyFlagSchema.parse({ type: 'unknown', severity: 'high', detectedAt: '2024-01-15T10:00:00.000Z', description: 'Test', affectedMetric: 'demandIndex', deviationScore: 2 })).toThrow(); });
  it('rejects invalid severity', () => { expect(() => AnomalyFlagSchema.parse({ type: 'spike', severity: 'extreme', detectedAt: '2024-01-15T10:00:00.000Z', description: 'Test', affectedMetric: 'demandIndex', deviationScore: 2 })).toThrow(); });
});

describe('AnomaliesOutputSchema', () => {
  const validOutput = {
    geoType: 'metro', geoCode: 'NYC', category: null, anomalyFlags: [], anomalyCount: 0,
    baselineStats: { mean: 100, stdDev: 10, median: 99 },
    freshness: { dataAsOf: '2024-01-15T10:00:00.000Z', computedAt: '2024-01-15T10:05:00.000Z', staleAfter: '2024-01-15T11:05:00.000Z', ttlSeconds: 3600 },
  };
  it('accepts valid output', () => { expect(AnomaliesOutputSchema.parse(validOutput)).toEqual(validOutput); });
  it('rejects negative anomalyCount', () => { expect(() => AnomaliesOutputSchema.parse({ ...validOutput, anomalyCount: -1 })).toThrow(); });
});

describe('ErrorEnvelopeSchema', () => {
  it('accepts valid error envelope', () => { expect(ErrorEnvelopeSchema.parse({ error: { code: 'INVALID_GEO_CODE', message: 'Invalid' } })).toBeDefined(); });
  it('accepts error with details and retryAfter', () => { expect(ErrorEnvelopeSchema.parse({ error: { code: 'RATE_LIMITED', message: 'Too many', details: { limit: 100 }, retryAfter: 60 } })).toBeDefined(); });
  it('rejects invalid error code', () => { expect(() => ErrorEnvelopeSchema.parse({ error: { code: 'UNKNOWN', message: 'Test' } })).toThrow(); });
  it('rejects non-positive retryAfter', () => { expect(() => ErrorEnvelopeSchema.parse({ error: { code: 'RATE_LIMITED', message: 'Test', retryAfter: 0 } })).toThrow(); });
});
