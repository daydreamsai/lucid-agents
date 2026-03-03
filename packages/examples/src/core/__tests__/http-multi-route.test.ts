/**
 * Tests for http-multi-route.ts
 *
 * Unit/contract tests — all calls go via app.fetch(), no real network.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { createMultiRouteAgent } from '../http-multi-route';

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
  const body = (await res.json()) as { output: Record<string, unknown> };
  return { res, body };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let app: App;

// Capture original values so we can restore them after tests
const originalEnv = {
  PAYMENTS_RECEIVABLE_ADDRESS: process.env.PAYMENTS_RECEIVABLE_ADDRESS,
  FACILITATOR_URL: process.env.FACILITATOR_URL,
  NETWORK: process.env.NETWORK,
};

beforeAll(async () => {
  // Do NOT set payment env vars — we want payments disabled in tests
  // so that paid entrypoints are called without x402 paywall validation
  // against a real facilitator.
  delete process.env.PAYMENTS_RECEIVABLE_ADDRESS;
  delete process.env.FACILITATOR_URL;
  delete process.env.NETWORK;

  const result = await createMultiRouteAgent();
  app = result.app;
});

afterAll(() => {
  // Restore env vars to avoid leaking state into other test suites
  if (originalEnv.PAYMENTS_RECEIVABLE_ADDRESS !== undefined) {
    process.env.PAYMENTS_RECEIVABLE_ADDRESS =
      originalEnv.PAYMENTS_RECEIVABLE_ADDRESS;
  }
  if (originalEnv.FACILITATOR_URL !== undefined) {
    process.env.FACILITATOR_URL = originalEnv.FACILITATOR_URL;
  }
  if (originalEnv.NETWORK !== undefined) {
    process.env.NETWORK = originalEnv.NETWORK;
  }
});

// ── Free route ────────────────────────────────────────────────────────────────

describe('status entrypoint (free)', () => {
  it('returns ok=true', async () => {
    const { res, body } = await invoke(app, 'status');
    expect(res.status).toBe(200);
    expect(body.output.ok).toBe(true);
  });

  it('returns a numeric uptime', async () => {
    const { body } = await invoke(app, 'status');
    expect(typeof body.output.uptime).toBe('number');
    expect((body.output.uptime as number) >= 0).toBe(true);
  });

  it('returns a valid ISO timestamp', async () => {
    const { body } = await invoke(app, 'status');
    const ts = body.output.timestamp as string;
    expect(typeof ts).toBe('string');
    expect(isNaN(new Date(ts).getTime())).toBe(false);
  });
});

// ── $0.01 route ───────────────────────────────────────────────────────────────

describe('summarize entrypoint (no price in test env)', () => {
  it('returns correct wordCount and charCount', async () => {
    const text = 'The quick brown fox';
    const { res, body } = await invoke(app, 'summarize', { text });
    expect(res.status).toBe(200);
    expect(body.output.wordCount).toBe(4);
    expect(body.output.charCount).toBe(text.length);
  });

  it('truncates long text with an ellipsis', async () => {
    const text = Array(25).fill('word').join(' ');
    const { res, body } = await invoke(app, 'summarize', { text });
    expect(res.status).toBe(200);
    expect((body.output.summary as string).endsWith('…')).toBe(true);
  });

  it('returns full text if under 20 words', async () => {
    const text = 'Short text here';
    const { res, body } = await invoke(app, 'summarize', { text });
    expect(res.status).toBe(200);
    expect(body.output.summary).toBe(text);
  });
});

// ── $0.05 route ───────────────────────────────────────────────────────────────

describe('translate entrypoint (no price in test env)', () => {
  it('returns translated text with source and target lang', async () => {
    const { res, body } = await invoke(app, 'translate', {
      text: 'Hello world',
      targetLanguage: 'fr',
    });
    expect(res.status).toBe(200);
    expect(body.output.sourceLang).toBe('en');
    expect(body.output.targetLang).toBe('fr');
    expect(typeof body.output.translated).toBe('string');
  });

  it('wraps output with target language tag', async () => {
    const { res, body } = await invoke(app, 'translate', {
      text: 'Hi',
      targetLanguage: 'es',
    });
    expect(res.status).toBe(200);
    expect((body.output.translated as string).startsWith('[ES]')).toBe(true);
  });
});

// ── Agent card ────────────────────────────────────────────────────────────────

describe('agent card', () => {
  it('exposes /.well-known/agent-card.json', async () => {
    const req = new Request('http://localhost/.well-known/agent-card.json');
    const res = await app.fetch(req);
    expect(res.ok).toBe(true);
    const card = (await res.json()) as { name: string };
    expect(card.name).toBe('http-multi-route');
  });
});
