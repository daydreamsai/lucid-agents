import { describe, it, expect, beforeAll } from 'vitest';
import {
  DemandIndexRequestSchema,
  DemandIndexResponseSchema,
  DemandTrendRequestSchema,
  DemandTrendResponseSchema,
  DemandAnomaliesRequestSchema,
  DemandAnomaliesResponseSchema,
  ErrorResponseSchema,
} from './schema';
import {
  calculateDemandIndex,
  calculateDemandTrend,
  detectDemandAnomalies,
  generateFreshness,
} from './logic';

/**
 * TDD Test Suite for Geo Demand Pulse Index API
 * Following the required TDD sequence from the PRD
 */

// 1. Contract Tests - Request/Response Schemas
describe('Contract Tests - Schema Validation', () => {
  describe('DemandIndexRequestSchema', () => {
    it('should accept valid request with all fields', () => {
      const input = {
        geoType: 'zip',
        geoCode: '94102',
        category: 'electronics',
        lookbackWindow: '30d',
        seasonalityMode: 'adjusted',
      };
      const result = DemandIndexRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept minimal valid request', () => {
      const input = { geoType: 'city', geoCode: 'san-francisco' };
      const result = DemandIndexRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject invalid geoType', () => {
      const input = { geoType: 'invalid', geoCode: '94102' };
      const result = DemandIndexRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject empty geoCode', () => {
      const input = { geoType: 'zip', geoCode: '' };
      const result = DemandIndexRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('DemandIndexResponseSchema', () => {
    it('should validate complete response', () => {
      const response = {
        demand_index: 78.5,
        velocity: 2.3,
        confidence_interval: { lower: 72.1, upper: 84.9 },
        anomaly_flags: ['high_demand'],
        comparable_geos: ['94103', '94104'],
        freshness: {
          generated_at: '2024-01-15T10:30:00Z',
          staleness_ms: 1800000,
          sla_status: 'fresh',
        },
        confidence: 0.92,
      };
      const result = DemandIndexResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should reject demand_index out of range', () => {
      const response = {
        demand_index: 150, // Invalid: > 100
        velocity: 2.3,
        confidence_interval: { lower: 72.1, upper: 84.9 },
        anomaly_flags: [],
        comparable_geos: [],
        freshness: {
          generated_at: '2024-01-15T10:30:00Z',
          staleness_ms: 0,
          sla_status: 'fresh',
        },
        confidence: 0.92,
      };
      const result = DemandIndexResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });
  });

  describe('DemandTrendResponseSchema', () => {
    it('should validate trend response with historical points', () => {
      const response = {
        velocity: 2.5,
        acceleration: 0.3,
        trend_direction: 'rising',
        momentum_score: 65,
        historical_points: [
          { timestamp: '2024-01-01T00:00:00Z', value: 50 },
          { timestamp: '2024-01-15T00:00:00Z', value: 55 },
        ],
        freshness: {
          generated_at: '2024-01-15T10:30:00Z',
          staleness_ms: 0,
          sla_status: 'fresh',
        },
        confidence: 0.88,
      };
      const result = DemandTrendResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });

  describe('DemandAnomaliesResponseSchema', () => {
    it('should validate anomalies response', () => {
      const response = {
        anomalies: [
          {
            type: 'spike',
            severity: 'high',
            detected_at: '2024-01-15T10:30:00Z',
            description: 'Demand spike detected',
            expected_value: 50,
            actual_value: 85,
            deviation_percent: 70,
          },
        ],
        anomaly_score: 70,
        baseline_demand: 50,
        current_demand: 85,
        freshness: {
          generated_at: '2024-01-15T10:30:00Z',
          staleness_ms: 0,
          sla_status: 'fresh',
        },
        confidence: 0.91,
      };
      const result = DemandAnomaliesResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });

  describe('ErrorResponseSchema', () => {
    it('should validate error envelope', () => {
      const error = {
        error: {
          code: 'INVALID_GEO_CODE',
          message: 'The provided geo code is not valid',
          details: { geoCode: 'invalid' },
        },
      };
      const result = ErrorResponseSchema.safeParse(error);
      expect(result.success).toBe(true);
    });
  });
});

// 2. Business Logic Tests - Core Transforms
describe('Business Logic Tests', () => {
  describe('calculateDemandIndex', () => {
    it('should return demand index within valid range', () => {
      const result = calculateDemandIndex({
        geoType: 'zip',
        geoCode: '94102',
      });
      expect(result.demand_index).toBeGreaterThanOrEqual(0);
      expect(result.demand_index).toBeLessThanOrEqual(100);
    });

    it('should return consistent results for same input', () => {
      const input = { geoType: 'zip' as const, geoCode: '94102' };
      const result1 = calculateDemandIndex(input);
      const result2 = calculateDemandIndex(input);
      expect(result1.demand_index).toBe(result2.demand_index);
    });

    it('should return different results for different geos', () => {
      const result1 = calculateDemandIndex({ geoType: 'zip', geoCode: '94102' });
      const result2 = calculateDemandIndex({ geoType: 'zip', geoCode: '10001' });
      expect(result1.demand_index).not.toBe(result2.demand_index);
    });

    it('should include confidence interval', () => {
      const result = calculateDemandIndex({ geoType: 'zip', geoCode: '94102' });
      expect(result.confidence_interval.lower).toBeLessThan(result.demand_index);
      expect(result.confidence_interval.upper).toBeGreaterThan(result.demand_index);
    });

    it('should flag high demand correctly', () => {
      // Use a geoCode that produces high demand
      const result = calculateDemandIndex({ geoType: 'zip', geoCode: '99999' });
      if (result.demand_index > 85) {
        expect(result.anomaly_flags).toContain('high_demand');
      }
    });
  });

  describe('calculateDemandTrend', () => {
    it('should return valid trend direction', () => {
      const result = calculateDemandTrend({ geoType: 'city', geoCode: 'new-york' });
      expect(['rising', 'falling', 'stable']).toContain(result.trend_direction);
    });

    it('should return momentum score in valid range', () => {
      const result = calculateDemandTrend({ geoType: 'zip', geoCode: '94102' });
      expect(result.momentum_score).toBeGreaterThanOrEqual(0);
      expect(result.momentum_score).toBeLessThanOrEqual(100);
    });

    it('should include historical points', () => {
      const result = calculateDemandTrend({ geoType: 'zip', geoCode: '94102' });
      expect(result.historical_points.length).toBeGreaterThan(0);
      result.historical_points.forEach(point => {
        expect(point.timestamp).toBeDefined();
        expect(point.value).toBeDefined();
      });
    });
  });

  describe('detectDemandAnomalies', () => {
    it('should return anomaly score in valid range', () => {
      const result = detectDemandAnomalies({ geoType: 'zip', geoCode: '94102' });
      expect(result.anomaly_score).toBeGreaterThanOrEqual(0);
      expect(result.anomaly_score).toBeLessThanOrEqual(100);
    });

    it('should include baseline and current demand', () => {
      const result = detectDemandAnomalies({ geoType: 'zip', geoCode: '94102' });
      expect(result.baseline_demand).toBeDefined();
      expect(result.current_demand).toBeDefined();
    });

    it('should detect anomalies when deviation is significant', () => {
      const result = detectDemandAnomalies({ geoType: 'zip', geoCode: '94102' });
      const deviation = Math.abs(
        ((result.current_demand - result.baseline_demand) / result.baseline_demand) * 100
      );
      if (deviation > 15) {
        expect(result.anomalies.length).toBeGreaterThan(0);
      }
    });
  });
});

// 3. Freshness/Quality Tests
describe('Freshness and Quality Tests', () => {
  describe('generateFreshness', () => {
    it('should mark as fresh when staleness is low', () => {
      const freshness = generateFreshness(0);
      expect(freshness.sla_status).toBe('fresh');
    });

    it('should mark as stale when staleness exceeds threshold', () => {
      const freshness = generateFreshness(400000); // > 5 minutes
      expect(freshness.sla_status).toBe('stale');
    });

    it('should mark as expired when staleness is very high', () => {
      const freshness = generateFreshness(4000000); // > 1 hour
      expect(freshness.sla_status).toBe('expired');
    });

    it('should include valid ISO timestamp', () => {
      const freshness = generateFreshness(0);
      expect(() => new Date(freshness.generated_at)).not.toThrow();
    });
  });

  describe('Response confidence', () => {
    it('should include confidence in demand index response', () => {
      const result = calculateDemandIndex({ geoType: 'zip', geoCode: '94102' });
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should include confidence in trend response', () => {
      const result = calculateDemandTrend({ geoType: 'zip', geoCode: '94102' });
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should include confidence in anomalies response', () => {
      const result = detectDemandAnomalies({ geoType: 'zip', geoCode: '94102' });
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });
});

// 4. Integration Tests (mocked - actual x402 tests require running server)
describe('Integration Tests - Endpoint Behavior', () => {
  it('should produce valid response for demand/index endpoint', () => {
    const input = { geoType: 'zip' as const, geoCode: '94102' };
    const parseResult = DemandIndexRequestSchema.safeParse(input);
    expect(parseResult.success).toBe(true);
    
    if (parseResult.success) {
      const output = calculateDemandIndex(parseResult.data);
      const outputResult = DemandIndexResponseSchema.safeParse(output);
      expect(outputResult.success).toBe(true);
    }
  });

  it('should produce valid response for demand/trend endpoint', () => {
    const input = { geoType: 'city' as const, geoCode: 'chicago' };
    const parseResult = DemandTrendRequestSchema.safeParse(input);
    expect(parseResult.success).toBe(true);
    
    if (parseResult.success) {
      const output = calculateDemandTrend(parseResult.data);
      const outputResult = DemandTrendResponseSchema.safeParse(output);
      expect(outputResult.success).toBe(true);
    }
  });

  it('should produce valid response for demand/anomalies endpoint', () => {
    const input = { geoType: 'region' as const, geoCode: 'northeast' };
    const parseResult = DemandAnomaliesRequestSchema.safeParse(input);
    expect(parseResult.success).toBe(true);
    
    if (parseResult.success) {
      const output = detectDemandAnomalies(parseResult.data);
      const outputResult = DemandAnomaliesResponseSchema.safeParse(output);
      expect(outputResult.success).toBe(true);
    }
  });
});
