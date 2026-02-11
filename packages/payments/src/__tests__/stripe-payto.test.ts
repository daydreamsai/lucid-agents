import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createStripePayToAddress } from '../stripe-payto';

const STATIC_ADDRESS = '0xabc0000000000000000000000000000000000000';

type StripeMockCapture = {
  requestPath?: string;
  requestHeaders?: Headers;
  requestBody?: string;
};

function startStripeMockServer(capture: StripeMockCapture) {
  const server = Bun.serve({
    port: 0,
    fetch: async request => {
      capture.requestPath = new URL(request.url).pathname;
      capture.requestHeaders = new Headers(request.headers);
      capture.requestBody = await request.text();

      return new Response(
        JSON.stringify({
          id: 'pi_123',
          next_action: {
            crypto_collect_deposit_details: {
              deposit_addresses: {
                base: {
                  address: STATIC_ADDRESS,
                },
              },
            },
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      );
    },
  });

  return {
    apiBaseUrl: `http://127.0.0.1:${server.port}`,
    stop: () => server.stop(true),
  };
}

describe('createStripePayToAddress amount parsing', () => {
  let stopServer: (() => void) | undefined;

  beforeEach(() => {
    stopServer = undefined;
  });

  afterEach(() => {
    stopServer?.();
    stopServer = undefined;
  });

  it('interprets digit-only string values as USD decimals', async () => {
    const capture: StripeMockCapture = {};
    const server = startStripeMockServer(capture);
    stopServer = server.stop;

    await createStripePayToAddress(
      { secretKey: 'sk_test_123', apiBaseUrl: server.apiBaseUrl },
      { price: '1000' }
    );

    expect(capture.requestPath).toBe('/v1/payment_intents');
    expect(capture.requestHeaders?.get('authorization')).toBe(
      'Bearer sk_test_123'
    );

    const params = new URLSearchParams(capture.requestBody);
    expect(params.get('amount')).toBe('100000');
  });

  it('supports USD strings with currency symbols and commas', async () => {
    const capture: StripeMockCapture = {};
    const server = startStripeMockServer(capture);
    stopServer = server.stop;

    await createStripePayToAddress(
      { secretKey: 'sk_test_123', apiBaseUrl: server.apiBaseUrl },
      { price: ' $1,234.56 ' }
    );

    const params = new URLSearchParams(capture.requestBody);
    expect(params.get('amount')).toBe('123456');
  });

  it('treats numeric values as precomputed base units', async () => {
    const capture: StripeMockCapture = {};
    const server = startStripeMockServer(capture);
    stopServer = server.stop;

    await createStripePayToAddress(
      { secretKey: 'sk_test_123', apiBaseUrl: server.apiBaseUrl },
      { price: 1_000_000 }
    );

    const params = new URLSearchParams(capture.requestBody);
    expect(params.get('amount')).toBe('100');
  });
});
