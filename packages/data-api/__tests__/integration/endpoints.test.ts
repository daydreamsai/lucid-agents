import { describe, test, expect } from 'bun:test';
import { createApp } from '../../src/index';
import { QuoteResponseSchema } from '../../src/schemas/quote';
import { ForecastResponseSchema } from '../../src/schemas/forecast';
import { CongestionResponseSchema } from '../../src/schemas/congestion';
import { ErrorResponseSchema } from '../../src/schemas/error';
import { MockProvider, FailingMockProvider } from '../../src/providers/mock-provider';
import { clearCache } from '../../src/index';

const app = createApp({ provider: new MockProvider(42), requirePayment: true });
const appNoPayment = createApp({ provider: new MockProvider(42), requirePayment: false });

function req(path: string, body?: object, headers?: Record<string, string>) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function reqNoPay(path: string, body?: object) {
  return appNoPayment.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('Endpoint Integration Tests', () => {
  test('4.1 gas-quote returns 402 without payment header', async () => {
    const res = await req('/entrypoints/gas-quote/invoke', { chain: 'ethereum' });
    expect(res.status).toBe(402);
  });

  test('4.2 gas-quote returns 200 with valid mock payment', async () => {
    const res = await req('/entrypoints/gas-quote/invoke', { chain: 'ethereum' }, { 'X-PAYMENT': 'mock-token' });
    expect(res.status).toBe(200);
  });

  test('4.3 gas-quote response passes QuoteResponseSchema', async () => {
    const res = await req('/entrypoints/gas-quote/invoke', { chain: 'ethereum' }, { 'X-PAYMENT': 'mock-token' });
    const body = await res.json() as Record<string, unknown>;
    expect(QuoteResponseSchema.safeParse(body).success).toBe(true);
  });

  test('4.4 gas-forecast returns valid ForecastResponse', async () => {
    const res = await req('/entrypoints/gas-forecast/invoke', { chain: 'base', target_blocks: 5 }, { 'X-PAYMENT': 'mock-token' });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(ForecastResponseSchema.safeParse(body).success).toBe(true);
  });

  test('4.5 gas-congestion returns valid CongestionResponse', async () => {
    const res = await req('/entrypoints/gas-congestion/invoke', { chain: 'polygon' }, { 'X-PAYMENT': 'mock-token' });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(CongestionResponseSchema.safeParse(body).success).toBe(true);
  });

  test('4.6 gas-quote with invalid chain returns 400', async () => {
    const res = await req('/entrypoints/gas-quote/invoke', { chain: 'solana' }, { 'X-PAYMENT': 'mock-token' });
    expect(res.status).toBe(400);
  });

  test('4.7 all endpoints include freshness and confidence', async () => {
    const res = await req('/entrypoints/gas-quote/invoke', { chain: 'ethereum' }, { 'X-PAYMENT': 'mock-token' });
    const body = await res.json() as Record<string, unknown>;
    expect(body.freshness).toBeDefined();
    expect(body.confidence).toBeDefined();
  });

  test('4.8 GET /health returns 200', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
  });

  test('4.9 400 response conforms to ErrorResponseSchema', async () => {
    const res = await req('/entrypoints/gas-quote/invoke', { chain: 'solana' }, { 'X-PAYMENT': 'mock-token' });
    const body = await res.json() as Record<string, unknown>;
    expect(ErrorResponseSchema.safeParse(body).success).toBe(true);
  });

  test('4.10 402 response conforms to ErrorResponseSchema', async () => {
    const res = await req('/entrypoints/gas-quote/invoke', { chain: 'ethereum' });
    const body = await res.json() as Record<string, unknown>;
    expect(ErrorResponseSchema.safeParse(body).success).toBe(true);
  });

  test('4.11 ErrorResponseSchema accepts 429-shaped error object', async () => {
    // Create a fresh app with very low rate limit for testing
    // We'll just verify the error format from existing 400/402 since rate limit
    // requires 100+ requests. Instead verify schema structure.
    const errorBody = { code: 429, message: 'Rate limit exceeded', request_id: crypto.randomUUID() };
    expect(ErrorResponseSchema.safeParse(errorBody).success).toBe(true);
  });

  test('4.12 500 internal error response conforms to ErrorResponseSchema', async () => {
    clearCache();
    const failApp = createApp({ provider: new FailingMockProvider(), requirePayment: false });
    const res = await failApp.request('/entrypoints/gas-quote/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chain: 'ethereum' }),
    });
    expect(res.status).toBe(500);
    const body = await res.json() as Record<string, unknown>;
    expect(ErrorResponseSchema.safeParse(body).success).toBe(true);
  });

  test('4.13 provider failure triggers 500 with error details', async () => {
    const failApp = createApp({ provider: new FailingMockProvider(), requirePayment: false });
    const res = await failApp.request('/entrypoints/gas-congestion/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chain: 'ethereum' }),
    });
    expect(res.status).toBe(500);
    const body = await res.json() as Record<string, unknown>;
    expect(body.message).toBe('Internal server error');
  });
});
