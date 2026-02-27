import { describe, test, expect, beforeEach } from 'bun:test';
import { createApp, clearCache } from '../../src/index';
import { MockProvider } from '../../src/providers/mock-provider';

// Separate app instance to avoid rate limit interference from other tests
const perfProvider = new MockProvider(42);
const app = createApp({ provider: perfProvider, requirePayment: false, rateLimitPerMinute: 10000 });

function req(path: string, body: object) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function measureP95(fn: () => Promise<void>, iterations: number): Promise<number> {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length * 0.95)];
}

describe('Performance Tests', () => {
  beforeEach(() => {
    clearCache();
  });

  test('5.1 gas-quote cached P95 < 500ms (100 sequential)', async () => {
    // Warm cache
    await req('/entrypoints/gas-quote/invoke', { chain: 'ethereum' });

    const p95 = await measureP95(
      async () => { await req('/entrypoints/gas-quote/invoke', { chain: 'ethereum' }); },
      100,
    );
    expect(p95).toBeLessThan(500);
  });

  test('5.2 gas-forecast cached P95 < 500ms', async () => {
    await req('/entrypoints/gas-forecast/invoke', { chain: 'base', target_blocks: 5 });

    const p95 = await measureP95(
      async () => { await req('/entrypoints/gas-forecast/invoke', { chain: 'base', target_blocks: 5 }); },
      100,
    );
    expect(p95).toBeLessThan(500);
  });

  test('5.3 gas-congestion cached P95 < 500ms', async () => {
    await req('/entrypoints/gas-congestion/invoke', { chain: 'polygon' });

    const p95 = await measureP95(
      async () => { await req('/entrypoints/gas-congestion/invoke', { chain: 'polygon' }); },
      100,
    );
    expect(p95).toBeLessThan(500);
  });

  test('5.4 concurrent load: 50 parallel requests complete without errors', async () => {
    const promises = Array.from({ length: 50 }, () =>
      req('/entrypoints/gas-quote/invoke', { chain: 'ethereum' }),
    );
    const responses = await Promise.all(promises);
    for (const res of responses) {
      expect(res.status).toBe(200);
    }
  });

  test('5.5 concurrent load: no race conditions in cache updates', async () => {
    clearCache();
    // Fire 20 concurrent requests for the same key
    const promises = Array.from({ length: 20 }, () =>
      (async () => { const r = await req('/entrypoints/gas-quote/invoke', { chain: 'ethereum' }); return r.json(); })(),
    );
    const results = await Promise.all(promises);
    // All should return valid data (same recommended_max_fee due to deterministic mock)
    const fees = results.map((r: any) => r.recommended_max_fee);
    const uniqueFees = new Set(fees);
    expect(uniqueFees.size).toBe(1); // all same
  });
});
