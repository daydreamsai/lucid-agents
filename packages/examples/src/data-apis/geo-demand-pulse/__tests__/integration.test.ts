import { a2a } from '@lucid-agents/a2a';
import { analytics } from '@lucid-agents/analytics';
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { beforeAll, describe, expect, it } from 'bun:test';

import { registerEntrypoints } from '../entrypoints';

let app: { fetch: (req: Request) => Response | Promise<Response> };

beforeAll(async () => {
  const agent = await createAgent({ name: 'geo-demand-pulse-test', version: '1.0.0', description: 'Test' })
    .use(http()).use(a2a()).use(analytics()).build();
  const agentApp = await createAgentApp(agent);
  process.env.PRICE_DEMAND_INDEX = '';
  process.env.PRICE_TREND = '';
  process.env.PRICE_ANOMALIES = '';
  registerEntrypoints(agentApp.addEntrypoint, agent);
  app = agentApp.app;
});

async function invoke(key: string, input: Record<string, unknown>) {
  return app.fetch(new Request(`http://localhost/entrypoints/${key}/invoke`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input }),
  }));
}

describe('Agent Card Discovery', () => {
  it('serves agent card at well-known endpoint', async () => {
    const res = await app.fetch(new Request('http://localhost/.well-known/agent-card.json'));
    expect(res.ok).toBe(true);
    const card = (await res.json()) as { name: string; skills: unknown[] };
    expect(card.name).toBe('geo-demand-pulse-test');
  });
  it('agent card includes all three entrypoints', async () => {
    const res = await app.fetch(new Request('http://localhost/.well-known/agent-card.json'));
    const card = (await res.json()) as { skills: Array<{ id: string }> };
    const skillIds = card.skills.map(s => s.id);
    expect(skillIds).toContain('demand-index');
    expect(skillIds).toContain('demand-trend');
    expect(skillIds).toContain('demand-anomalies');
  });
});

describe('Demand Index Endpoint', () => {
  it('returns 200 with valid input', async () => {
    const res = await invoke('demand-index', { geoType: 'zip', geoCode: '94105' });
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { output: Record<string, unknown> };
    expect(body.output.geoType).toBe('zip');
    expect(body.output.demandIndex).toBeDefined();
  });
  it('returns valid JSON contract shape', async () => {
    const res = await invoke('demand-index', { geoType: 'city', geoCode: 'sf' });
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { output: Record<string, unknown> };
    expect(body.output).toHaveProperty('geoType');
    expect(body.output).toHaveProperty('demandIndex');
    expect(body.output).toHaveProperty('velocity');
    expect(body.output).toHaveProperty('confidenceInterval');
    expect(body.output).toHaveProperty('comparableGeos');
    expect(body.output).toHaveProperty('freshness');
  });
  it('applies default values for optional fields', async () => {
    const res = await invoke('demand-index', { geoType: 'zip', geoCode: '10001' });
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { output: Record<string, unknown> };
    expect(body.output.category).toBeNull();
  });
  it('rejects invalid geoType', async () => { expect((await invoke('demand-index', { geoType: 'invalid', geoCode: '94105' })).ok).toBe(false); });
  it('rejects empty geoCode', async () => { expect((await invoke('demand-index', { geoType: 'zip', geoCode: '' })).ok).toBe(false); });
});

describe('Demand Trend Endpoint', () => {
  it('returns 200 with valid input', async () => {
    const res = await invoke('demand-trend', { geoType: 'metro', geoCode: 'NYC' });
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { output: Record<string, unknown> };
    expect(body.output.trendDirection).toBeDefined();
  });
  it('returns valid JSON contract shape', async () => {
    const res = await invoke('demand-trend', { geoType: 'state', geoCode: 'CA' });
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { output: Record<string, unknown> };
    expect(body.output).toHaveProperty('trendDirection');
    expect(body.output).toHaveProperty('trendStrength');
    expect(body.output).toHaveProperty('dataPoints');
  });
  it('returns data points array', async () => {
    const res = await invoke('demand-trend', { geoType: 'zip', geoCode: '94105' });
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { output: { dataPoints: unknown[] } };
    expect(Array.isArray(body.output.dataPoints)).toBe(true);
    expect(body.output.dataPoints.length).toBeGreaterThan(0);
  });
});

describe('Demand Anomalies Endpoint', () => {
  it('returns 200 with valid input', async () => {
    const res = await invoke('demand-anomalies', { geoType: 'county', geoCode: 'la' });
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { output: Record<string, unknown> };
    expect(body.output.anomalyFlags).toBeDefined();
  });
  it('returns valid JSON contract shape', async () => {
    const res = await invoke('demand-anomalies', { geoType: 'zip', geoCode: '94105' });
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { output: Record<string, unknown> };
    expect(body.output).toHaveProperty('anomalyFlags');
    expect(body.output).toHaveProperty('anomalyCount');
    expect(body.output).toHaveProperty('baselineStats');
  });
  it('returns baseline statistics', async () => {
    const res = await invoke('demand-anomalies', { geoType: 'city', geoCode: 'chicago' });
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { output: { baselineStats: { mean: number; stdDev: number; median: number } } };
    expect(typeof body.output.baselineStats.mean).toBe('number');
  });
  it('anomalyCount matches anomalyFlags length', async () => {
    const res = await invoke('demand-anomalies', { geoType: 'metro', geoCode: 'LA' });
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { output: { anomalyFlags: unknown[]; anomalyCount: number } };
    expect(body.output.anomalyCount).toBe(body.output.anomalyFlags.length);
  });
});

describe('Freshness Metadata', () => {
  it('all endpoints include freshness metadata', async () => {
    for (const endpoint of ['demand-index', 'demand-trend', 'demand-anomalies']) {
      const res = await invoke(endpoint, { geoType: 'zip', geoCode: '94105' });
      expect(res.ok).toBe(true);
      const body = (await res.json()) as { output: { freshness: { ttlSeconds: number } } };
      expect(body.output.freshness.ttlSeconds).toBeGreaterThan(0);
    }
  });
  it('staleAfter is after computedAt', async () => {
    const res = await invoke('demand-index', { geoType: 'zip', geoCode: '94105' });
    const body = (await res.json()) as { output: { freshness: { computedAt: string; staleAfter: string } } };
    expect(new Date(body.output.freshness.staleAfter).getTime()).toBeGreaterThan(new Date(body.output.freshness.computedAt).getTime());
  });
});

describe('Confidence Intervals', () => {
  it('demand-index includes confidence interval', async () => {
    const res = await invoke('demand-index', { geoType: 'zip', geoCode: '94105' });
    const body = (await res.json()) as { output: { confidenceInterval: { level: number } } };
    expect(body.output.confidenceInterval.level).toBe(0.95);
  });
  it('demand-trend includes confidence interval', async () => {
    const res = await invoke('demand-trend', { geoType: 'city', geoCode: 'sf' });
    const body = (await res.json()) as { output: { confidenceInterval: { level: number } } };
    expect(body.output.confidenceInterval.level).toBe(0.95);
  });
});

describe('Error Handling', () => {
  it('returns error for missing required fields', async () => { expect((await invoke('demand-index', { geoType: 'zip' })).ok).toBe(false); });
  it('returns error for invalid enum values', async () => { expect((await invoke('demand-trend', { geoType: 'zip', geoCode: '94105', granularity: 'hourly' })).ok).toBe(false); });
});
