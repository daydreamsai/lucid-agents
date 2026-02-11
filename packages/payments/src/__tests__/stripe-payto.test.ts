import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createStripePayToAddress } from '../stripe-payto';

const STATIC_ADDRESS = '0xabc0000000000000000000000000000000000000';

function stripeSuccessResponse() {
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
}

describe('createStripePayToAddress amount parsing', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('interprets digit-only string values as USD decimals', async () => {
    let requestBody = '';
    globalThis.fetch = (async (
      _input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      requestBody = typeof init?.body === 'string' ? init.body : '';
      return stripeSuccessResponse();
    }) as typeof globalThis.fetch;

    await createStripePayToAddress(
      { secretKey: 'sk_test_123' },
      { price: '1000' }
    );

    const params = new URLSearchParams(requestBody);
    expect(params.get('amount')).toBe('100000');
  });

  it('supports USD strings with currency symbols and commas', async () => {
    let requestBody = '';
    globalThis.fetch = (async (
      _input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      requestBody = typeof init?.body === 'string' ? init.body : '';
      return stripeSuccessResponse();
    }) as typeof globalThis.fetch;

    await createStripePayToAddress(
      { secretKey: 'sk_test_123' },
      { price: ' $1,234.56 ' }
    );

    const params = new URLSearchParams(requestBody);
    expect(params.get('amount')).toBe('123456');
  });

  it('treats numeric values as precomputed base units', async () => {
    let requestBody = '';
    globalThis.fetch = (async (
      _input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      requestBody = typeof init?.body === 'string' ? init.body : '';
      return stripeSuccessResponse();
    }) as typeof globalThis.fetch;

    await createStripePayToAddress(
      { secretKey: 'sk_test_123' },
      { price: 1_000_000 }
    );

    const params = new URLSearchParams(requestBody);
    expect(params.get('amount')).toBe('100');
  });
});
