import { describe, it, expect, beforeAll } from 'bun:test';
import { createGasOracleApp } from '../../src/agent.js';
import type { GasQuoteResponse, GasForecastResponse, CongestionResponse } from '../../src/schemas/index.js';

// We test the Hono app directly without starting a network listener
const app = createGasOracleApp();

async function getJson<T>(path: string): Promise<{ status: number; body: T }> {
  const res = await app.fetch(new Request(`http://localhost${path}`));
  const body = (await res.json()) as T;
  return { status: res.status, body };
}

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const { status, body } = await getJson<{ status: string }>('/health');
    expect(status).toBe(200);
    expect((body as any).status).toBe('ok');
  });
});

describe('GET /v1/gas/quote', () => {
  it('returns 400 when chain is missing', async () => {
    const { status } = await getJson('/v1/gas/quote');
    expect(status).toBe(400);
  });

  it('returns 400 for invalid urgency', async () => {
    const { status } = await getJson('/v1/gas/quote?chain=ethereum&urgency=turbo');
    expect(status).toBe(400);
  });

  // Note: this test calls the actual RPC. In CI it may be skipped if network unavailable.
  it.skipIf(!process.env.INTEGRATION_TESTS)('returns a valid GasQuoteResponse for ethereum', async () => {
    const { status, body } = await getJson<GasQuoteResponse>('/v1/gas/quote?chain=ethereum&urgency=medium');
    expect(status).toBe(200);
    const response = body as GasQuoteResponse;
    expect(response.chain).toBe('ethereum');
    expect(typeof response.recommended_max_fee).toBe('string');
    expect(typeof response.freshness_ms).toBe('number');
    expect(response.inclusion_probability_curve.length).toBeGreaterThan(0);
    expect(response.confidence_score).toBeGreaterThanOrEqual(0);
    expect(response.confidence_score).toBeLessThanOrEqual(1);
  });
});

describe('GET /v1/gas/forecast', () => {
  it('returns 400 when chain is missing', async () => {
    const { status } = await getJson('/v1/gas/forecast');
    expect(status).toBe(400);
  });

  it.skipIf(!process.env.INTEGRATION_TESTS)('returns a valid GasForecastResponse', async () => {
    const { status, body } = await getJson<GasForecastResponse>(
      '/v1/gas/forecast?chain=ethereum&horizonMinutes=30&granularity=5'
    );
    expect(status).toBe(200);
    const response = body as GasForecastResponse;
    expect(response.forecast.length).toBeGreaterThan(0);
    expect(response.freshness_ms).toBeGreaterThanOrEqual(0);
    for (const point of response.forecast) {
      expect(point.confidence_score).toBeGreaterThanOrEqual(0);
      expect(point.confidence_score).toBeLessThanOrEqual(1);
    }
  });
});

describe('GET /v1/gas/congestion', () => {
  it('returns 400 when chain is missing', async () => {
    const { status } = await getJson('/v1/gas/congestion');
    expect(status).toBe(400);
  });

  it.skipIf(!process.env.INTEGRATION_TESTS)('returns a valid CongestionResponse', async () => {
    const { status, body } = await getJson<CongestionResponse>(
      '/v1/gas/congestion?chain=ethereum'
    );
    expect(status).toBe(200);
    const response = body as CongestionResponse;
    expect(['low', 'moderate', 'high', 'critical']).toContain(response.congestion_state);
    expect(response.freshness_ms).toBeGreaterThanOrEqual(0);
  });
});

describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const { status } = await getJson('/v1/gas/unknown');
    expect(status).toBe(404);
  });
});
