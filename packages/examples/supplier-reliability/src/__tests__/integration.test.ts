import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { createSupplierReliabilityAgent } from '../index';
import type { Hono } from 'hono';

describe('Integration Tests - Paid Endpoints', () => {
  let app: Hono;
  let testServer: any;

  beforeAll(async () => {
    app = await createSupplierReliabilityAgent({
      paymentsConfig: {
        payTo: '0xabc0000000000000000000000000000000000000',
        facilitatorUrl: 'https://facilitator.test',
        network: 'eip155:84532',
      },
    });
    
    testServer = {
      port: 3000,
      fetch: app.fetch.bind(app),
    };
  });

  afterAll(() => {
    // Cleanup if needed
  });

  describe('GET /v1/suppliers/score', () => {
    it('should return 402 when payment is required', async () => {
      const req = new Request('http://localhost:3000/v1/suppliers/score?supplierId=SUP-001&region=APAC');
      const res = await testServer.fetch(req);
      
      expect(res.status).toBe(402);
      expect(res.headers.get('PAYMENT-REQUIRED')).toBeTruthy();
      
      const body = await res.json();
      expect(body.x402Version).toBe(2);
    });

    it('should return valid data after payment', async () => {
      const paymentHeader = createMockPaymentHeader();
      const req = new Request('http://localhost:3000/v1/suppliers/score?supplierId=SUP-001&region=APAC', {
        headers: {
          'X-Payment': paymentHeader,
        },
      });
      const res = await testServer.fetch(req);
      
      expect(res.status).toBe(200);
      const body = await res.json();
      
      expect(body.supplier_score).toBeGreaterThanOrEqual(0);
      expect(body.supplier_score).toBeLessThanOrEqual(1);
      expect(body.confidence).toBeGreaterThanOrEqual(0);
      expect(body.freshness_ms).toBeGreaterThanOrEqual(0);
    });

    it('should return 400 for invalid supplierId', async () => {
      const paymentHeader = createMockPaymentHeader();
      const req = new Request('http://localhost:3000/v1/suppliers/score?supplierId=&region=APAC', {
        headers: {
          'X-Payment': paymentHeader,
        },
      });
      const res = await testServer.fetch(req);
      
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it('should return 400 for invalid region', async () => {
      const paymentHeader = createMockPaymentHeader();
      const req = new Request('http://localhost:3000/v1/suppliers/score?supplierId=SUP-001&region=INVALID', {
        headers: {
          'X-Payment': paymentHeader,
        },
      });
      const res = await testServer.fetch(req);
      
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });
  });

  describe('GET /v1/suppliers/lead-time-forecast', () => {
    it('should return 402 when payment is required', async () => {
      const req = new Request('http://localhost:3000/v1/suppliers/lead-time-forecast?supplierId=SUP-001&region=APAC');
      const res = await testServer.fetch(req);
      
      expect(res.status).toBe(402);
    });

    it('should return valid forecast after payment', async () => {
      const paymentHeader = createMockPaymentHeader();
      const req = new Request('http://localhost:3000/v1/suppliers/lead-time-forecast?supplierId=SUP-001&region=APAC&horizonDays=30', {
        headers: {
          'X-Payment': paymentHeader,
        },
      });
      const res = await testServer.fetch(req);
      
      expect(res.status).toBe(200);
      const body = await res.json();
      
      expect(body.lead_time_p50).toBeGreaterThanOrEqual(0);
      expect(body.lead_time_p95).toBeGreaterThanOrEqual(body.lead_time_p50);
      expect(body.drift_probability).toBeGreaterThanOrEqual(0);
      expect(body.confidence).toBeGreaterThanOrEqual(0);
      expect(body.freshness_ms).toBeGreaterThanOrEqual(0);
    });

    it('should use default horizonDays when not provided', async () => {
      const paymentHeader = createMockPaymentHeader();
      const req = new Request('http://localhost:3000/v1/suppliers/lead-time-forecast?supplierId=SUP-001&region=APAC', {
        headers: {
          'X-Payment': paymentHeader,
        },
      });
      const res = await testServer.fetch(req);
      
      expect(res.status).toBe(200);
    });
  });

  describe('GET /v1/suppliers/disruption-alerts', () => {
    it('should return 402 when payment is required', async () => {
      const req = new Request('http://localhost:3000/v1/suppliers/disruption-alerts?supplierId=SUP-001&region=APAC');
      const res = await testServer.fetch(req);
      
      expect(res.status).toBe(402);
    });

    it('should return valid alerts after payment', async () => {
      const paymentHeader = createMockPaymentHeader();
      const req = new Request('http://localhost:3000/v1/suppliers/disruption-alerts?supplierId=SUP-001&region=APAC&riskTolerance=medium', {
        headers: {
          'X-Payment': paymentHeader,
        },
      });
      const res = await testServer.fetch(req);
      
      expect(res.status).toBe(200);
      const body = await res.json();
      
      expect(body.disruption_probability).toBeGreaterThanOrEqual(0);
      expect(body.disruption_probability).toBeLessThanOrEqual(1);
      expect(Array.isArray(body.alert_reasons)).toBe(true);
      expect(['low', 'medium', 'high', 'critical']).toContain(body.severity);
      expect(body.confidence).toBeGreaterThanOrEqual(0);
      expect(body.freshness_ms).toBeGreaterThanOrEqual(0);
    });

    it('should use default riskTolerance when not provided', async () => {
      const paymentHeader = createMockPaymentHeader();
      const req = new Request('http://localhost:3000/v1/suppliers/disruption-alerts?supplierId=SUP-001&region=APAC', {
        headers: {
          'X-Payment': paymentHeader,
        },
      });
      const res = await testServer.fetch(req);
      
      expect(res.status).toBe(200);
    });
  });

  describe('Performance Tests', () => {
    it('should respond within 500ms for cached path', async () => {
      const paymentHeader = createMockPaymentHeader();
      const req = new Request('http://localhost:3000/v1/suppliers/score?supplierId=SUP-001&region=APAC', {
        headers: {
          'X-Payment': paymentHeader,
        },
      });
      
      const start = Date.now();
      const res = await testServer.fetch(req);
      const duration = Date.now() - start;
      
      expect(res.status).toBe(200);
      expect(duration).toBeLessThan(500);
    });
  });
});

// Mock payment header for testing
function createMockPaymentHeader(): string {
  const payload = {
    payload: {
      authorization: {
        to: '0xabc0000000000000000000000000000000000000',
        amount: '1000000',
      },
    },
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}
