import { describe, expect, it, mock } from 'bun:test';
import { createGatewayFetch } from './fetch';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

const DEFAULT_PAY_RESULT = {
  data: { result: 'paid content' },
  amount: 100000n,
  formattedAmount: '0.10',
  transaction: '0xtx123',
  status: 200,
};

function makeGatewayClientCtor(payImpl?: (...args: unknown[]) => Promise<unknown>) {
  const payFn = payImpl ?? mock(async () => DEFAULT_PAY_RESULT);
  return mock(function MockGatewayClient(_cfg: unknown) {
    return { pay: payFn };
  }) as unknown as new (cfg: unknown) => { pay: typeof payFn };
}

const VALID_OPTS = {
  privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as `0x${string}`,
  chain: 'base' as const,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createGatewayFetch', () => {
  it('throws if privateKey is missing', () => {
    expect(() => createGatewayFetch({ privateKey: '' as `0x${string}`, chain: 'base' })).toThrow('privateKey');
  });

  it('throws if chain is missing', () => {
    expect(() => createGatewayFetch({ privateKey: VALID_OPTS.privateKey, chain: '' as never })).toThrow('chain');
  });

  it('returns a fetch-compatible function', () => {
    const GatewayClient = makeGatewayClientCtor();
    const f = createGatewayFetch(VALID_OPTS, { GatewayClient });
    expect(typeof f).toBe('function');
  });

  it('has a preconnect method', () => {
    const GatewayClient = makeGatewayClientCtor();
    const f = createGatewayFetch(VALID_OPTS, { GatewayClient });
    expect(typeof f.preconnect).toBe('function');
  });

  it('returns response unchanged for non-402 status', async () => {
    const payFn = mock(async () => DEFAULT_PAY_RESULT);
    const GatewayClientWithSpy = mock(function MockGC(_c: unknown) {
      return { pay: payFn };
    }) as unknown as new (c: unknown) => { pay: typeof payFn };

    const mockFetch = mock(async () => new Response('{"ok":true}', { status: 200 }));
    const f = createGatewayFetch(
      { ...VALID_OPTS, fetchImpl: mockFetch as unknown as typeof fetch },
      { GatewayClient: GatewayClientWithSpy }
    );

    const response = await f('https://example.com/resource');
    expect(response.status).toBe(200);
    expect(payFn).not.toHaveBeenCalled();
  });

  it('calls GatewayClient.pay() when 402 received', async () => {
    const payFn = mock(async (_url: string, _opts?: unknown) => DEFAULT_PAY_RESULT);
    const GatewayClient = mock(function MockGC(_c: unknown) {
      return { pay: payFn };
    }) as unknown as new (c: unknown) => { pay: typeof payFn };

    const mockFetch = mock(async () => new Response('{"error":"payment_required"}', { status: 402 }));
    const f = createGatewayFetch(
      { ...VALID_OPTS, fetchImpl: mockFetch as unknown as typeof fetch },
      { GatewayClient }
    );

    const response = await f('https://example.com/paid-resource');
    expect(payFn).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ result: 'paid content' });
  });

  it('propagates errors from GatewayClient.pay()', async () => {
    const badPay = mock(async () => {
      throw new Error('Gateway payment failed: insufficient balance');
    });
    const GatewayClient = mock(function MockGC(_c: unknown) {
      return { pay: badPay };
    }) as unknown as new (c: unknown) => { pay: typeof badPay };

    const mockFetch = mock(async () => new Response('', { status: 402 }));
    const f = createGatewayFetch(
      { ...VALID_OPTS, fetchImpl: mockFetch as unknown as typeof fetch },
      { GatewayClient }
    );

    await expect(f('https://example.com/paid')).rejects.toThrow('Gateway payment failed: insufficient balance');
  });
});
