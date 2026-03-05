import { describe, expect, it, mock } from 'bun:test';
import { createCircleGatewayFacilitator } from './facilitator';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeMockClient(overrides: Partial<{
  verify: (...args: unknown[]) => Promise<unknown>;
  settle: (...args: unknown[]) => Promise<unknown>;
  getSupported: () => Promise<unknown>;
}> = {}) {
  return {
    verify: overrides.verify ?? mock(async () => ({ isValid: true, payer: '0xdeadbeef' })),
    settle: overrides.settle ?? mock(async () => ({
      success: true,
      transaction: '0xabc123',
      network: 'eip155:8453',
      payer: '0xdeadbeef',
    })),
    getSupported: overrides.getSupported ?? mock(async () => ({
      kinds: [
        {
          x402Version: 2,
          scheme: 'exact',
          network: 'eip155:8453',
          extra: { name: 'GatewayWalletBatched', version: '1' },
        },
      ],
      extensions: [],
      signers: {},
    })),
  };
}

function makeMockClientCtor(client = makeMockClient()) {
  // Return the client object from the constructor — JS uses returned objects from `new`
  const Ctor = mock(function MockBatchFacilitatorClient(_cfg?: unknown) {
    return client;
  }) as unknown as new (config?: unknown) => typeof client;
  return Ctor;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createCircleGatewayFacilitator', () => {
  it('returns a facilitator with the default gateway URL', () => {
    const f = createCircleGatewayFacilitator(undefined, { BatchFacilitatorClient: makeMockClientCtor() });
    expect(f.gatewayUrl).toBe('https://gateway.circle.com');
  });

  it('respects a custom gatewayUrl', () => {
    const f = createCircleGatewayFacilitator(
      { gatewayUrl: 'https://custom.example.com' },
      { BatchFacilitatorClient: makeMockClientCtor() }
    );
    expect(f.gatewayUrl).toBe('https://custom.example.com');
  });

  it('settle() calls BatchFacilitatorClient.settle() with the authorization', async () => {
    const settleImpl = mock(async (_p: unknown, _r: unknown) => ({
      success: true,
      transaction: '0xabc123',
      network: 'eip155:8453',
      payer: '0xdeadbeef',
    }));
    const f = createCircleGatewayFacilitator(
      undefined,
      { BatchFacilitatorClient: makeMockClientCtor(makeMockClient({ settle: settleImpl })) }
    );

    const result = await f.settle({ x402Version: 2 }, { scheme: 'exact' });

    expect(settleImpl).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.transaction).toBe('0xabc123');
  });

  it('settle() error propagates correctly', async () => {
    const badSettle = mock(async () => {
      throw new Error('Settlement failed: insufficient funds');
    });
    const f = createCircleGatewayFacilitator(
      undefined,
      { BatchFacilitatorClient: makeMockClientCtor(makeMockClient({ settle: badSettle })) }
    );

    await expect(f.settle({}, {})).rejects.toThrow('Settlement failed: insufficient funds');
  });

  it('verify() returns isValid true', async () => {
    const f = createCircleGatewayFacilitator(
      undefined,
      { BatchFacilitatorClient: makeMockClientCtor() }
    );
    const result = await f.verify({}, {});
    expect(result.isValid).toBe(true);
    expect(result.payer).toBe('0xdeadbeef');
  });

  it('getSupported() returns GatewayWalletBatched in kinds', async () => {
    const f = createCircleGatewayFacilitator(
      undefined,
      { BatchFacilitatorClient: makeMockClientCtor() }
    );
    const supported = await f.getSupported();
    expect(supported.kinds).toHaveLength(1);
    expect(supported.kinds[0].extra?.name).toBe('GatewayWalletBatched');
    expect(supported.kinds[0].scheme).toBe('exact');
  });
});
