import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import { resolvePayTo } from '../payto-resolver';

const STATIC_ADDRESS = '0xabc0000000000000000000000000000000000000';

describe('resolvePayTo', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns static payTo when static mode is configured', () => {
    const config: PaymentsConfig = {
      payTo: STATIC_ADDRESS,
      facilitatorUrl: 'https://facilitator.test',
      network: 'eip155:84532',
    };

    const resolved = resolvePayTo(config);
    expect(resolved).toBe(STATIC_ADDRESS);
  });

  it('returns async resolver function when stripe mode is configured', () => {
    const config: PaymentsConfig = {
      stripe: { secretKey: 'sk_test_123' },
      facilitatorUrl: 'https://facilitator.test',
      network: 'eip155:8453',
    };

    const resolved = resolvePayTo(config);
    expect(typeof resolved).toBe('function');
  });

  it('does not treat null stripe as stripe mode', () => {
    const config = {
      payTo: STATIC_ADDRESS,
      stripe: null,
      facilitatorUrl: 'https://facilitator.test',
      network: 'eip155:84532',
    } as unknown as PaymentsConfig;

    const resolved = resolvePayTo(config);
    expect(resolved).toBe(STATIC_ADDRESS);
  });

  it('uses payment header destination when available', async () => {
    const config: PaymentsConfig = {
      stripe: { secretKey: 'sk_test_123' },
      facilitatorUrl: 'https://facilitator.test',
      network: 'eip155:8453',
    };

    const payTo = resolvePayTo(config);
    expect(typeof payTo).toBe('function');
    if (typeof payTo !== 'function') return;

    const paymentHeader = Buffer.from(
      JSON.stringify({
        payload: {
          authorization: {
            to: STATIC_ADDRESS,
          },
        },
      })
    ).toString('base64');

    const resolved = await payTo({ paymentHeader });
    expect(resolved).toBe(STATIC_ADDRESS);
  });

  it('fails closed when payment header is malformed', async () => {
    const config: PaymentsConfig = {
      stripe: { secretKey: 'sk_test_123' },
      facilitatorUrl: 'https://facilitator.test',
      network: 'eip155:8453',
    };

    const payTo = resolvePayTo(config);
    expect(typeof payTo).toBe('function');
    if (typeof payTo !== 'function') return;

    await expect(
      payTo({ paymentHeader: Buffer.from('not-json').toString('base64') })
    ).rejects.toThrow('Unable to extract payTo from payment header');
  });

  it('creates stripe payment intent when payment header is missing', async () => {
    const fetchMock = mock(
      async (_input: RequestInfo | URL, _init?: RequestInit) => {
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
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const config: PaymentsConfig = {
      stripe: { secretKey: 'sk_test_123' },
      facilitatorUrl: 'https://facilitator.test',
      network: 'eip155:8453',
    };

    const payTo = resolvePayTo(config);
    expect(typeof payTo).toBe('function');
    if (typeof payTo !== 'function') return;

    const resolved = await payTo({});
    expect(resolved).toBe(STATIC_ADDRESS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
