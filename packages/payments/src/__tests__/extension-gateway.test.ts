/**
 * Tests for Circle Gateway integration in the payments extension.
 * Verifies that facilitator: 'circle-gateway' routes to Circle facilitator,
 * and that the default behaviour is unaffected.
 */
import { describe, expect, it, mock } from 'bun:test';
import { createCircleGatewayFacilitator } from '../gateway/facilitator';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeMockFacilitatorCtor() {
  return mock(function MockBatchFacilitatorClient(_cfg?: unknown) {
    return {
      verify: mock(async () => ({ isValid: true })),
      settle: mock(async () => ({ success: true, transaction: '0xtx', network: 'eip155:8453' })),
      getSupported: mock(async () => ({
        kinds: [
          { x402Version: 2, scheme: 'exact', network: 'eip155:8453', extra: { name: 'GatewayWalletBatched', version: '1' } },
        ],
        extensions: [],
        signers: {},
      })),
    };
  }) as unknown as new (cfg?: unknown) => object;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Circle Gateway extension integration', () => {
  it('createCircleGatewayFacilitator returns facilitator with Circle gateway URL', () => {
    const f = createCircleGatewayFacilitator(undefined, { BatchFacilitatorClient: makeMockFacilitatorCtor() });
    expect(f.gatewayUrl).toBe('https://gateway.circle.com');
  });

  it('facilitator with circle-gateway does NOT use Daydreams URL', () => {
    const circleF = createCircleGatewayFacilitator(
      { gatewayUrl: 'https://gateway.circle.com' },
      { BatchFacilitatorClient: makeMockFacilitatorCtor() }
    );
    const daydreamsUrl = 'https://facilitator.daydreams.systems';
    expect(circleF.gatewayUrl).not.toBe(daydreamsUrl);
    expect(circleF.gatewayUrl).toContain('circle.com');
  });

  it('facilitator has verify(), settle(), getSupported() methods', () => {
    const f = createCircleGatewayFacilitator(undefined, { BatchFacilitatorClient: makeMockFacilitatorCtor() });
    expect(typeof f.verify).toBe('function');
    expect(typeof f.settle).toBe('function');
    expect(typeof f.getSupported).toBe('function');
  });

  it('getSupported() returns GatewayWalletBatched scheme', async () => {
    const f = createCircleGatewayFacilitator(undefined, { BatchFacilitatorClient: makeMockFacilitatorCtor() });
    const supported = await f.getSupported();
    const gatewayKind = supported.kinds.find((k: Record<string, unknown>) => (k.extra as Record<string, unknown>)?.name === 'GatewayWalletBatched');
    expect(gatewayKind).toBeDefined();
    expect((gatewayKind as Record<string, unknown>).scheme).toBe('exact');
  });

  it('default (no facilitator) does NOT include circle-gateway in config', () => {
    const originalEnv = process.env.CIRCLE_GATEWAY_FACILITATOR;
    delete process.env.CIRCLE_GATEWAY_FACILITATOR;
    delete process.env.PAYMENTS_RECEIVABLE_ADDRESS;
    delete process.env.PAYMENTS_NETWORK;

    process.env.PAYMENTS_RECEIVABLE_ADDRESS = '0xabc0000000000000000000000000000000000001';
    process.env.PAYMENTS_NETWORK = 'eip155:84532';

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { paymentsFromEnv } = require('../utils');
    const config = paymentsFromEnv() as Record<string, unknown>;

    expect(config.facilitator).toBeUndefined();

    if (originalEnv !== undefined) {
      process.env.CIRCLE_GATEWAY_FACILITATOR = originalEnv;
    }
    delete process.env.PAYMENTS_RECEIVABLE_ADDRESS;
    delete process.env.PAYMENTS_NETWORK;
  });

  it('CIRCLE_GATEWAY_FACILITATOR=true sets facilitator: circle-gateway in config', () => {
    process.env.CIRCLE_GATEWAY_FACILITATOR = 'true';
    process.env.PAYMENTS_RECEIVABLE_ADDRESS = '0xabc0000000000000000000000000000000000002';
    process.env.PAYMENTS_NETWORK = 'eip155:8453';

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { paymentsFromEnv } = require('../utils');
    const config = paymentsFromEnv() as Record<string, unknown>;

    expect(config.facilitator).toBe('circle-gateway');

    delete process.env.CIRCLE_GATEWAY_FACILITATOR;
    delete process.env.PAYMENTS_RECEIVABLE_ADDRESS;
    delete process.env.PAYMENTS_NETWORK;
  });
});
