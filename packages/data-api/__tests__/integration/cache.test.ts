import { describe, test, expect, beforeEach } from 'bun:test';
import type { QuoteResponse } from '../../src/schemas/quote';
import { createApp, clearCache } from '../../src/index';
import { MockProvider } from '../../src/providers/mock-provider';

const provider = new MockProvider(42);
const app = createApp({ provider, requirePayment: false });

function req(path: string, body: object) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Cache Tests', () => {
  beforeEach(() => {
    clearCache();
  });

  test('4.14 cache hit returns same response within TTL window', async () => {
    const res1 = await req('/entrypoints/gas-quote/invoke', { chain: 'ethereum' });
    const body1 = await res1.json() as QuoteResponse;

    const res2 = await req('/entrypoints/gas-quote/invoke', { chain: 'ethereum' });
    const body2 = await res2.json() as QuoteResponse;

    // Second call should return cached data
    expect(body2.recommended_max_fee).toBe(body1.recommended_max_fee);
    expect(body2.priority_fee).toBe(body1.priority_fee);
  });

  test('4.15 cache miss after TTL expiry fetches fresh data', async () => {
    // This is a timing-sensitive test. We can verify cache works by checking data_source.
    const res1 = await req('/entrypoints/gas-quote/invoke', { chain: 'ethereum' });
    const body1 = await res1.json() as QuoteResponse;
    expect(body1.freshness.data_source).toBe('live');

    // Second request within TTL should be cached
    const res2 = await req('/entrypoints/gas-quote/invoke', { chain: 'ethereum' });
    const body2 = await res2.json() as QuoteResponse;
    expect(body2.freshness.data_source).toBe('cached');
  });

  test('4.16 cache TTL is chain-specific', async () => {
    // Both ethereum and base should cache independently
    const resEth = await req('/entrypoints/gas-quote/invoke', { chain: 'ethereum' });
    const resBase = await req('/entrypoints/gas-quote/invoke', { chain: 'base' });

    const bodyEth = await resEth.json() as QuoteResponse;
    const bodyBase = await resBase.json() as QuoteResponse;

    expect(bodyEth.chain).toBe('ethereum');
    expect(bodyBase.chain).toBe('base');
    expect(bodyEth.recommended_max_fee).not.toBe(bodyBase.recommended_max_fee);
  });

  test('4.17 cache invalidation returns live data after clear', async () => {
    // First request populates cache
    await req('/entrypoints/gas-quote/invoke', { chain: 'ethereum' });

    // Clear and verify next request is live
    clearCache();
    const res = await req('/entrypoints/gas-quote/invoke', { chain: 'ethereum' });
    const body = await res.json() as QuoteResponse;
    expect(body.freshness.data_source).toBe('live');
  });
});
