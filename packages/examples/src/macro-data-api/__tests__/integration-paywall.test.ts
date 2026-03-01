import { describe, expect, it } from 'bun:test';
import { createMacroApiApp } from '../api';

describe('x402 paywall integration', () => {
  it('requires payment for monetized GET endpoint when paywall is enabled', async () => {
    const { app } = await createMacroApiApp({
      paywall: {
        enabled: true,
        middlewareFactory: () => async (_c, _next) => {
          return new Response(
            JSON.stringify({ error: { code: 'payment_required', message: 'x402 payment required' } }),
            { status: 402, headers: { 'content-type': 'application/json' } }
          );
        },
      },
    });

    const res = await app.request(
      'http://agent/v1/macro/events?eventTypes=cpi&geography=US&horizon=1m'
    );

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error.code).toBe('payment_required');
  });

  it('returns data after successful payment verification middleware pass-through', async () => {
    const { app } = await createMacroApiApp({
      paywall: {
        enabled: true,
        middlewareFactory: () => async (_c, next) => {
          await next();
        },
      },
      now: () => new Date('2026-02-15T12:00:00.000Z'),
    });

    const res = await app.request(
      'http://agent/v1/macro/impact-vectors?eventTypes=cpi&geography=US&sectorSet=equities&horizon=1m'
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.impact_vector).toBeDefined();
    expect(body.freshness).toBeDefined();
    expect(body.confidence).toBeDefined();
  });

  it('requires payment for monetized POST endpoint when paywall is enabled', async () => {
    const { app } = await createMacroApiApp({
      paywall: { enabled: true },
    });

    const res = await app.request('http://agent/v1/macro/scenario-score', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        eventTypes: ['CPI'],
        geography: 'US',
        sectorSet: ['equities'],
        horizon: '1m',
        scenarioAssumptions: {
          inflationShock: 0.4,
        },
      }),
    });

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error.code).toBe('payment_required');
  });
});
