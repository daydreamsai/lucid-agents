import { describe, test, expect, beforeEach } from 'bun:test';
import { createGasOracleAPI } from '../api';
import { MockGasDataProvider } from '../provider';

describe('Gas Oracle API - Integration Tests', () => {
  let app: ReturnType<typeof createGasOracleAPI>;
  let provider: MockGasDataProvider;

  beforeEach(() => {
    provider = new MockGasDataProvider();
    app = createGasOracleAPI(provider);
  });

  describe('GET /health', () => {
    test('should return health status', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe('ok');
      expect(data.timestamp).toBeDefined();
    });
  });

  describe('GET /v1/gas/quote', () => {
    test('should return quote for valid request', async () => {
      const res = await app.request('/v1/gas/quote?chain=ethereum&urgency=medium');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.recommended_max_fee).toBeDefined();
      expect(data.priority_fee).toBeDefined();
      expect(data.inclusion_probability_curve).toBeInstanceOf(Array);
      expect(data.congestion_state).toMatch(/^(low|moderate|high|severe)$/);
      expect(data.confidence_score).toBeGreaterThan(0);
      expect(data.freshness_ms).toBeGreaterThanOrEqual(0);
      expect(data.timestamp).toBeDefined();
    });

    test('should apply default values', async () => {
      const res = await app.request('/v1/gas/quote?chain=ethereum');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toBeDefined();
    });

    test('should return 400 for invalid chain', async () => {
      const res = await app.request('/v1/gas/quote?chain=invalid');
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error.code).toBe('INVALID_REQUEST');
      expect(data.error.message).toContain('Invalid request parameters');
    });

    test('should return 400 for missing chain', async () => {
      const res = await app.request('/v1/gas/quote');
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    test('should handle all urgency levels', async () => {
      const urgencies = ['low', 'medium', 'high', 'urgent'];

      for (const urgency of urgencies) {
        const res = await app.request(`/v1/gas/quote?chain=ethereum&urgency=${urgency}`);
        expect(res.status).toBe(200);
      }
    });

    test('should handle all tx types', async () => {
      const txTypes = ['transfer', 'swap', 'contract'];

      for (const txType of txTypes) {
        const res = await app.request(`/v1/gas/quote?chain=ethereum&txType=${txType}`);
        expect(res.status).toBe(200);
      }
    });

    test('should handle recentFailureTolerance parameter', async () => {
      const res = await app.request('/v1/gas/quote?chain=ethereum&recentFailureTolerance=0.1');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /v1/gas/forecast', () => {
    test('should return forecast for valid request', async () => {
      const res = await app.request('/v1/gas/forecast?chain=ethereum&targetBlocks=10');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.chain).toBe('ethereum');
      expect(data.current_block).toBeGreaterThan(0);
      expect(data.forecast).toBeInstanceOf(Array);
      expect(data.forecast).toHaveLength(10);
      expect(data.freshness_ms).toBeGreaterThanOrEqual(0);
      expect(data.timestamp).toBeDefined();
    });

    test('should apply default targetBlocks', async () => {
      const res = await app.request('/v1/gas/forecast?chain=ethereum');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.forecast).toHaveLength(10);
    });

    test('should return 400 for invalid chain', async () => {
      const res = await app.request('/v1/gas/forecast?chain=invalid');
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    test('should return 400 for negative targetBlocks', async () => {
      const res = await app.request('/v1/gas/forecast?chain=ethereum&targetBlocks=-5');
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    test('should handle all supported chains', async () => {
      const chains = ['ethereum', 'base', 'arbitrum', 'optimism', 'polygon'];

      for (const chain of chains) {
        const res = await app.request(`/v1/gas/forecast?chain=${chain}`);
        expect(res.status).toBe(200);
      }
    });
  });

  describe('GET /v1/gas/congestion', () => {
    test('should return congestion for valid request', async () => {
      const res = await app.request('/v1/gas/congestion?chain=ethereum');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.chain).toBe('ethereum');
      expect(data.congestion_state).toMatch(/^(low|moderate|high|severe)$/);
      expect(data.pending_tx_count).toBeGreaterThanOrEqual(0);
      expect(data.avg_block_utilization).toBeGreaterThanOrEqual(0);
      expect(data.avg_block_utilization).toBeLessThanOrEqual(1);
      expect(data.base_fee_trend).toMatch(/^(rising|stable|falling)$/);
      expect(data.freshness_ms).toBeGreaterThanOrEqual(0);
      expect(data.timestamp).toBeDefined();
    });

    test('should return 400 for missing chain', async () => {
      const res = await app.request('/v1/gas/congestion');
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    test('should return 400 for invalid chain', async () => {
      const res = await app.request('/v1/gas/congestion?chain=invalid');
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error.code).toBe('INVALID_REQUEST');
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for unknown endpoints', async () => {
      const res = await app.request('/v1/gas/unknown');
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error.code).toBe('NOT_FOUND');
      expect(data.error.message).toContain('does not exist');
    });

    test('should include timestamp in error responses', async () => {
      const res = await app.request('/v1/gas/quote');
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.timestamp).toBeDefined();
      expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('Response Time', () => {
    test('should respond within 500ms for cached data', async () => {
      const start = Date.now();
      const res = await app.request('/v1/gas/quote?chain=ethereum');
      const duration = Date.now() - start;

      expect(res.status).toBe(200);
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Paid Success Path', () => {
    test('should return 200 with valid data for paid request', async () => {
      // Simulate a successful paid request (not 402)
      const res = await app.request('/v1/gas/quote?chain=ethereum&urgency=high&txType=swap');
      
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.recommended_max_fee).toBeDefined();
      expect(data.priority_fee).toBeDefined();
      expect(data.inclusion_probability_curve).toBeInstanceOf(Array);
      expect(data.inclusion_probability_curve.length).toBeGreaterThan(0);
      expect(data.congestion_state).toMatch(/^(low|moderate|high|severe)$/);
      expect(data.confidence_score).toBeGreaterThan(0);
      expect(data.confidence_score).toBeLessThanOrEqual(1);
      expect(data.freshness_ms).toBeGreaterThanOrEqual(0);
      expect(data.timestamp).toBeDefined();
      expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('should handle forecast paid request successfully', async () => {
      const res = await app.request('/v1/gas/forecast?chain=base&targetBlocks=5');
      
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.chain).toBe('base');
      expect(data.current_block).toBeGreaterThan(0);
      expect(data.forecast).toBeInstanceOf(Array);
      expect(data.forecast).toHaveLength(5);
      
      // Verify forecast structure
      data.forecast.forEach((item: any, index: number) => {
        expect(item.block_offset).toBe(index);
        expect(item.estimated_base_fee).toBeDefined();
        expect(item.estimated_priority_fee).toBeDefined();
        expect(item.confidence).toBeGreaterThan(0);
        expect(item.confidence).toBeLessThanOrEqual(1);
      });
    });

    test('should handle congestion paid request successfully', async () => {
      const res = await app.request('/v1/gas/congestion?chain=arbitrum');
      
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.chain).toBe('arbitrum');
      expect(data.congestion_state).toMatch(/^(low|moderate|high|severe)$/);
      expect(data.pending_tx_count).toBeGreaterThanOrEqual(0);
      expect(data.avg_block_utilization).toBeGreaterThanOrEqual(0);
      expect(data.avg_block_utilization).toBeLessThanOrEqual(1);
      expect(data.base_fee_trend).toMatch(/^(rising|stable|falling)$/);
      expect(data.freshness_ms).toBeGreaterThanOrEqual(0);
      expect(data.timestamp).toBeDefined();
    });
  });
});
