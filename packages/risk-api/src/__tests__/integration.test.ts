import { describe, expect, it, beforeAll } from 'bun:test';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  RiskScoreRequestSchema,
  RiskScoreResponseSchema,
  ExposurePathsRequestSchema,
  ExposurePathsResponseSchema,
  EntityProfileRequestSchema,
  EntityProfileResponseSchema,
} from '../schemas';
import {
  calculateRiskScore,
  findExposurePaths,
  buildEntityProfile,
  computeFreshness,
  validateConfidence,
} from '../lib/risk-engine';

const VALID_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';

describe('Integration Tests - Risk API Endpoints', () => {
  let app: Hono;

  beforeAll(() => {
    app = new Hono();

    // Mock x402 payment middleware - returns 402 if no X-PAYMENT header
    const requirePayment = (price: string) => async (c: any, next: any) => {
      const payment = c.req.header('X-PAYMENT');
      if (!payment) {
        return c.json({
          x402Version: 2,
          price,
          payTo: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          network: 'eip155:1',
        }, 402, {
          'PAYMENT-REQUIRED': 'true',
        });
      }
      await next();
    };

    // POST /v1/risk/score
    app.post('/v1/risk/score', requirePayment('0.10'), async c => {
      const body = await c.req.json();
      const parsed = RiskScoreRequestSchema.safeParse(body);
      
      if (!parsed.success) {
        return c.json({ error: { code: 'validation_error', message: 'Invalid request' } }, 400);
      }

      const { address } = parsed.data;
      const riskFactors = [
        { factor: 'sanctions_proximity', weight: 0.3, evidence: ['2 hops from sanctioned'] },
      ];
      const scoreData = calculateRiskScore({ address, riskFactors });
      const freshness = computeFreshness(new Date().toISOString());

      return c.json({
        ...scoreData,
        freshness,
        confidence: 0.85,
      });
    });

    // GET /v1/risk/exposure-paths
    app.post('/v1/risk/exposure-paths', requirePayment('0.15'), async c => {
      const body = await c.req.json();
      const parsed = ExposurePathsRequestSchema.safeParse(body);
      
      if (!parsed.success) {
        return c.json({ error: { code: 'validation_error', message: 'Invalid request' } }, 400);
      }

      const { address, max_depth = 3, min_confidence = 0.6 } = parsed.data;
      const graph = {
        [address]: [{ target: '0x1234567890123456789012345678901234567890', risk: 0.7, confidence: 0.8 }],
      };
      const pathsData = findExposurePaths({ address, maxDepth: max_depth, minConfidence: min_confidence, graph });
      const freshness = computeFreshness(new Date().toISOString());

      return c.json({ ...pathsData, freshness });
    });

    // GET /v1/risk/entity-profile
    app.post('/v1/risk/entity-profile', requirePayment('0.20'), async c => {
      const body = await c.req.json();
      const parsed = EntityProfileRequestSchema.safeParse(body);
      
      if (!parsed.success) {
        return c.json({ error: { code: 'validation_error', message: 'Invalid request' } }, 400);
      }

      const { address } = parsed.data;
      const transactions = [
        { timestamp: '2025-01-01T00:00:00Z', volume: '1000' },
        { timestamp: '2026-02-26T23:00:00Z', volume: '2000' },
      ];
      const profileData = buildEntityProfile({
        address,
        transactions,
        riskData: { sanctionsProximity: 2, mixerExposure: false, highRiskCounterparties: 1 },
      });
      const freshness = computeFreshness(new Date().toISOString());

      return c.json({ ...profileData, freshness, confidence: 0.92 });
    });

    // Entrypoints listing
    app.get('/entrypoints', c => {
      return c.json({
        entrypoints: [
          { key: 'risk-score', description: 'Calculate risk score', price: '0.10' },
          { key: 'exposure-paths', description: 'Find exposure paths', price: '0.15' },
          { key: 'entity-profile', description: 'Get entity profile', price: '0.20' },
        ],
      });
    });

    // Agent manifest
    app.get('/.well-known/agent.json', c => {
      return c.json({
        name: 'risk-api',
        version: '1.0.0',
        entrypoints: [
          { key: 'risk-score', price: '0.10' },
          { key: 'exposure-paths', price: '0.15' },
          { key: 'entity-profile', price: '0.20' },
        ],
      });
    });
  });

  describe('POST /v1/risk/score - Payment Required', () => {
    it('should return 402 Payment Required without payment', async () => {
      const response = await app.request('/v1/risk/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: VALID_ADDRESS, network: 'eip155:1' }),
      });

      expect(response.status).toBe(402);
      expect(response.headers.get('PAYMENT-REQUIRED')).toBe('true');
    });

    it('should include x402 payment metadata in 402 response', async () => {
      const response = await app.request('/v1/risk/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: VALID_ADDRESS, network: 'eip155:1' }),
      });

      const body = await response.json();
      expect(body.x402Version).toBe(2);
      expect(body.price).toBeDefined();
      expect(body.payTo).toBeDefined();
      expect(body.network).toBeDefined();
    });

    it('should return data with valid payment', async () => {
      const response = await app.request('/v1/risk/score', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-PAYMENT': 'valid-payment-token',
        },
        body: JSON.stringify({ address: VALID_ADDRESS, network: 'eip155:1' }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.risk_score).toBeDefined();
      expect(body.freshness).toBeDefined();
      expect(body.confidence).toBeDefined();
    });

    it('should validate request schema', async () => {
      const response = await app.request('/v1/risk/score', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-PAYMENT': 'valid-payment-token',
        },
        body: JSON.stringify({ address: 'invalid-address', network: 'eip155:1' }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /v1/risk/exposure-paths - Payment Required', () => {
    it('should return 402 Payment Required without payment', async () => {
      const response = await app.request('/v1/risk/exposure-paths', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: VALID_ADDRESS, network: 'eip155:1' }),
      });

      expect(response.status).toBe(402);
    });

    it('should return paths with valid payment', async () => {
      const response = await app.request('/v1/risk/exposure-paths', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-PAYMENT': 'valid-payment-token',
        },
        body: JSON.stringify({ address: VALID_ADDRESS, network: 'eip155:1' }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.paths).toBeDefined();
      expect(body.freshness).toBeDefined();
    });
  });

  describe('POST /v1/risk/entity-profile - Payment Required', () => {
    it('should return 402 Payment Required without payment', async () => {
      const response = await app.request('/v1/risk/entity-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: VALID_ADDRESS, network: 'eip155:1' }),
      });

      expect(response.status).toBe(402);
    });

    it('should return profile with valid payment', async () => {
      const response = await app.request('/v1/risk/entity-profile', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-PAYMENT': 'valid-payment-token',
        },
        body: JSON.stringify({ address: VALID_ADDRESS, network: 'eip155:1' }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.address).toBe(VALID_ADDRESS);
      expect(body.risk_indicators).toBeDefined();
      expect(body.freshness).toBeDefined();
    });
  });

  describe('Entrypoint Registration', () => {
    it('should list all risk API entrypoints', async () => {
      const response = await app.request('/entrypoints');
      expect(response.status).toBe(200);

      const body = await response.json();
      const keys = body.entrypoints.map((e: any) => e.key);

      expect(keys).toContain('risk-score');
      expect(keys).toContain('exposure-paths');
      expect(keys).toContain('entity-profile');
    });

    it('should include pricing in agent manifest', async () => {
      const response = await app.request('/.well-known/agent.json');
      expect(response.status).toBe(200);

      const manifest = await response.json();
      const riskScoreEntrypoint = manifest.entrypoints.find((e: any) => e.key === 'risk-score');

      expect(riskScoreEntrypoint).toBeDefined();
      expect(riskScoreEntrypoint.price).toBeDefined();
    });
  });
});
