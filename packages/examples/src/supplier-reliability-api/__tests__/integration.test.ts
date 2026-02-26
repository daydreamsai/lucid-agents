/**
 * Integration Tests - API Endpoints
 */
import { describe, it, expect, beforeAll } from 'bun:test';
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { z } from 'zod';
import {
  SupplierScoreInputSchema, SupplierScoreOutputSchema,
  LeadTimeForecastInputSchema, LeadTimeForecastOutputSchema,
  DisruptionAlertsInputSchema, DisruptionAlertsOutputSchema,
  ErrorEnvelopeSchema,
} from '../schemas';
import { dataService } from '../data-service';

describe('Integration Tests - API Endpoints', () => {
  let app: any;

  beforeAll(async () => {
    const agent = await createAgent({ name: 'supplier-reliability-api-test', version: '1.0.0', description: 'Test' }).use(http()).build();
    const agentApp = await createAgentApp(agent);
    app = agentApp.app;

    agentApp.addEntrypoint({
      key: 'score', path: '/v1/suppliers/score', description: 'Get supplier score',
      input: SupplierScoreInputSchema, output: z.union([SupplierScoreOutputSchema, ErrorEnvelopeSchema]),
      handler: async (ctx: any) => {
        const result = await dataService.getSupplierScore(ctx.input.supplierId, ctx.input.category, ctx.input.region);
        return result ? { output: result } : { output: { error: { code: 'supplier_not_found' as const, message: 'Not found' } } };
      },
    });

    agentApp.addEntrypoint({
      key: 'lead-time-forecast', path: '/v1/suppliers/lead-time-forecast', description: 'Get forecast',
      input: LeadTimeForecastInputSchema, output: z.union([LeadTimeForecastOutputSchema, ErrorEnvelopeSchema]),
      handler: async (ctx: any) => {
        const result = await dataService.getLeadTimeForecast(ctx.input.supplierId, ctx.input.category, ctx.input.region, ctx.input.horizonDays ?? 30);
        return result ? { output: result } : { output: { error: { code: 'supplier_not_found' as const, message: 'Not found' } } };
      },
    });

    agentApp.addEntrypoint({
      key: 'disruption-alerts', path: '/v1/suppliers/disruption-alerts', description: 'Get alerts',
      input: DisruptionAlertsInputSchema, output: z.union([DisruptionAlertsOutputSchema, ErrorEnvelopeSchema]),
      handler: async (ctx: any) => {
        const result = await dataService.getDisruptionAlerts(ctx.input.supplierId, ctx.input.riskTolerance ?? 'medium', ctx.input.category, ctx.input.region);
        return result ? { output: result } : { output: { error: { code: 'supplier_not_found' as const, message: 'Not found' } } };
      },
    });
  });

  describe('GET /v1/suppliers/score', () => {
    it('should return supplier score for valid request', async () => {
      const res = await app.request('/v1/suppliers/score/invoke', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId: 'SUP001' }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.supplier_id).toBe('SUP001');
      expect(data.supplier_score).toBeDefined();
      expect(data.confidence).toBeDefined();
      expect(data.freshness).toBeDefined();
    });

    it('should return error for non-existent supplier', async () => {
      const res = await app.request('/v1/suppliers/score/invoke', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId: 'SUP999' }),
      });
      const data = await res.json();
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe('supplier_not_found');
    });
  });

  describe('GET /v1/suppliers/lead-time-forecast', () => {
    it('should return forecast for valid request', async () => {
      const res = await app.request('/v1/suppliers/lead-time-forecast/invoke', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId: 'SUP001', category: 'electronics', region: 'APAC', horizonDays: 30 }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.supplier_id).toBe('SUP001');
      expect(data.lead_time_p50).toBeDefined();
      expect(data.lead_time_p95).toBeDefined();
    });

    it('should use default horizonDays', async () => {
      const res = await app.request('/v1/suppliers/lead-time-forecast/invoke', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId: 'SUP001', category: 'electronics', region: 'APAC' }),
      });
      const data = await res.json();
      expect(data.horizon_days).toBe(30);
    });
  });

  describe('GET /v1/suppliers/disruption-alerts', () => {
    it('should return alerts for valid request', async () => {
      const res = await app.request('/v1/suppliers/disruption-alerts/invoke', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId: 'SUP002' }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.supplier_id).toBe('SUP002');
      expect(data.disruption_probability).toBeDefined();
      expect(Array.isArray(data.alert_reasons)).toBe(true);
    });

    it('should respect riskTolerance parameter', async () => {
      const lowRes = await app.request('/v1/suppliers/disruption-alerts/invoke', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId: 'SUP002', riskTolerance: 'low' }),
      });
      const highRes = await app.request('/v1/suppliers/disruption-alerts/invoke', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId: 'SUP002', riskTolerance: 'high' }),
      });
      const lowData = await lowRes.json();
      const highData = await highRes.json();
      expect(lowData.disruption_probability).toBeGreaterThan(highData.disruption_probability);
    });
  });

  describe('Agent Manifest', () => {
    it('should expose agent manifest', async () => {
      const res = await app.request('/.well-known/agent.json');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.name).toBe('supplier-reliability-api-test');
    });
  });

  describe('Response Format Consistency', () => {
    it('should always include freshness and confidence in successful responses', async () => {
      const endpoints = [
        { path: '/v1/suppliers/score/invoke', body: { supplierId: 'SUP001' } },
        { path: '/v1/suppliers/lead-time-forecast/invoke', body: { supplierId: 'SUP001', category: 'electronics', region: 'APAC' } },
        { path: '/v1/suppliers/disruption-alerts/invoke', body: { supplierId: 'SUP001' } },
      ];
      for (const ep of endpoints) {
        const res = await app.request(ep.path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ep.body) });
        const data = await res.json();
        if (!data.error) {
          expect(data.freshness).toBeDefined();
          expect(data.confidence).toBeDefined();
        }
      }
    });
  });
});
