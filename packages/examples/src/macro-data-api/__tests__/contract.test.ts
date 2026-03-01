import { describe, expect, it } from 'bun:test';
import { createMacroApiApp } from '../api';

describe('macro api contract', () => {
  it('GET /v1/macro/events returns event_feed with freshness and confidence', async () => {
    const { app } = await createMacroApiApp({
      paywall: { enabled: false },
      now: () => new Date('2026-02-15T12:00:00.000Z'),
    });

    const res = await app.request(
      'http://agent/v1/macro/events?eventTypes=cpi,FED_RATE&geography=US&horizon=1m'
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.api_version).toBe('v1');
    expect(Array.isArray(body.event_feed)).toBe(true);
    expect(body.event_feed.length).toBeGreaterThan(0);
    expect(body.freshness).toBeDefined();
    expect(body.confidence).toBeDefined();
  });

  it('GET /v1/macro/impact-vectors returns impact_vector, confidence_band, sensitivity_breakdown, freshness, confidence', async () => {
    const { app } = await createMacroApiApp({
      paywall: { enabled: false },
      now: () => new Date('2026-02-15T12:00:00.000Z'),
    });

    const res = await app.request(
      'http://agent/v1/macro/impact-vectors?eventTypes=cpi&geography=US&sectorSet=equities,energy&horizon=3m'
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.api_version).toBe('v1');
    expect(body.impact_vector).toBeDefined();
    expect(body.confidence_band).toBeDefined();
    expect(Array.isArray(body.sensitivity_breakdown)).toBe(true);
    expect(body.freshness).toBeDefined();
    expect(body.confidence).toBeDefined();
  });

  it('POST /v1/macro/scenario-score returns scenario_score and required fields', async () => {
    const { app } = await createMacroApiApp({
      paywall: { enabled: false },
      now: () => new Date('2026-02-15T12:00:00.000Z'),
    });

    const res = await app.request('http://agent/v1/macro/scenario-score', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        eventTypes: ['CPI', 'Fed Rate'],
        geography: 'US',
        sectorSet: ['equities', 'bonds'],
        horizon: '3m',
        scenarioAssumptions: {
          inflationShock: 0.8,
          oilShock: 0.2,
          policySurprise: 0.6,
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.api_version).toBe('v1');
    expect(body.scenario_score).toBeDefined();
    expect(body.impact_vector).toBeDefined();
    expect(body.confidence_band).toBeDefined();
    expect(body.freshness).toBeDefined();
    expect(body.confidence).toBeDefined();
  });

  it('returns error envelope for invalid request', async () => {
    const { app } = await createMacroApiApp({
      paywall: { enabled: false },
      now: () => new Date('2026-02-15T12:00:00.000Z'),
    });

    const res = await app.request('http://agent/v1/macro/scenario-score', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        eventTypes: ['INVALID_EVENT'],
        geography: 'US',
        sectorSet: ['equities'],
        horizon: '3m',
        scenarioAssumptions: {
          inflationShock: 2,
        },
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('invalid_request');
    expect(typeof body.error.message).toBe('string');
  });

  it('POST /v1/macro/scenario-score lowers confidence when assumptions are sparse', async () => {
    const { app } = await createMacroApiApp({
      paywall: { enabled: false },
      now: () => new Date('2026-02-15T12:00:00.000Z'),
    });

    const basePayload = {
      eventTypes: ['CPI', 'Fed Rate'],
      geography: 'US',
      sectorSet: ['equities', 'bonds'],
      horizon: '3m',
    };

    const [fullRes, sparseRes] = await Promise.all([
      app.request('http://agent/v1/macro/scenario-score', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...basePayload,
          scenarioAssumptions: {
            inflationShock: 0.8,
            oilShock: 0.2,
            policySurprise: 0.6,
            demandShock: 0.4,
          },
        }),
      }),
      app.request('http://agent/v1/macro/scenario-score', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...basePayload,
          scenarioAssumptions: {
            inflationShock: 0.8,
          },
        }),
      }),
    ]);

    expect(fullRes.status).toBe(200);
    expect(sparseRes.status).toBe(200);

    const fullBody = await fullRes.json();
    const sparseBody = await sparseRes.json();

    expect(sparseBody.confidence.score).toBeLessThan(fullBody.confidence.score);
  });
});
