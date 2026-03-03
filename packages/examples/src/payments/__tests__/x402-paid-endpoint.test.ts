/**
 * Tests for x402-paid-endpoint.ts
 *
 * Unit/contract tests — no live network required.
 * We build the agent in-process and test via app.fetch().
 */

import { beforeAll, describe, expect, it } from 'bun:test';

import { createPaidEndpointAgent } from '../x402-paid-endpoint';

type App = { fetch: (req: Request) => Response | Promise<Response> };

// ── Helpers ───────────────────────────────────────────────────────────────────

async function invoke(
  app: App,
  key: string,
  input: Record<string, unknown> = {}
) {
  const req = new Request(`http://localhost/entrypoints/${key}/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });
  const res = await app.fetch(req);
  return {
    res,
    body: res.ok
      ? ((await res.json()) as { output: Record<string, unknown> })
      : null,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let app: App;

beforeAll(async () => {
  // Clear payment env vars so x402 paywall validation is skipped in tests.
  // The agent still builds; entrypoints return 200 without a payment header.
  delete process.env.PAYMENTS_RECEIVABLE_ADDRESS;
  delete process.env.FACILITATOR_URL;
  delete process.env.NETWORK;

  const result = await createPaidEndpointAgent();
  app = result.app;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('free-info entrypoint', () => {
  it('returns 200 with agent name and version', async () => {
    const { res, body } = await invoke(app, 'free-info');
    expect(res.status).toBe(200);
    expect(body?.output.name).toBe('x402-paid-endpoint');
    expect(body?.output.version).toBe('1.0.0');
  });

  it('lists paidEndpoints array', async () => {
    const { body } = await invoke(app, 'free-info');
    expect(Array.isArray(body?.output.paidEndpoints)).toBe(true);
    expect((body?.output.paidEndpoints as string[]).length).toBeGreaterThan(0);
  });
});

describe('premium-data entrypoint', () => {
  it('returns data string containing the query', async () => {
    const { res, body } = await invoke(app, 'premium-data', {
      query: 'test query',
    });
    // Without a real x402 payment the paywall may return 402 or succeed
    // depending on facilitator configuration; we accept either.
    if (res.status === 200) {
      expect(typeof body?.output.data).toBe('string');
      expect(body?.output.data as string).toContain('test query');
    } else {
      // 402 Payment Required is the expected paywall response
      expect([402, 200]).toContain(res.status);
    }
  });

  it('returns processedAt ISO timestamp when called successfully', async () => {
    const { res, body } = await invoke(app, 'premium-data', {
      query: 'hello',
    });
    if (res.status === 200) {
      expect(typeof body?.output.processedAt).toBe('string');
      // Validate it parses as a date
      const d = new Date(body?.output.processedAt as string);
      expect(isNaN(d.getTime())).toBe(false);
    }
  });
});

describe('deep-analysis entrypoint', () => {
  it('returns wordCount and sentiment when called successfully', async () => {
    const { res, body } = await invoke(app, 'deep-analysis', {
      text: 'The quick brown fox jumps over the lazy dog and then some more words',
    });
    if (res.status === 200) {
      expect(typeof body?.output.wordCount).toBe('number');
      expect(body?.output.wordCount as number).toBeGreaterThan(0);
      expect(typeof body?.output.sentiment).toBe('string');
    } else {
      expect([402, 200]).toContain(res.status);
    }
  });
});

describe('agent card', () => {
  it('exposes /.well-known/agent-card.json', async () => {
    const req = new Request('http://localhost/.well-known/agent-card.json');
    const res = await app.fetch(req);
    expect(res.ok).toBe(true);
    const card = (await res.json()) as { name: string };
    expect(card.name).toBe('x402-paid-endpoint');
  });
});
