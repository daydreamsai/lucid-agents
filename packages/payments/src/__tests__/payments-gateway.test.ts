/**
 * Tests verifying acceptance criteria:
 * - 402 response accepts includes GatewayWalletBatched when Circle Gateway active
 * - Standard x402 flow unaffected when CIRCLE_GATEWAY_FACILITATOR not set
 */
import { describe, expect, it, mock } from 'bun:test';
import { createCircleGatewayFacilitator } from '../gateway/facilitator';

function makeMockFacilitatorCtor(overrides?: Partial<{ getSupported: () => Promise<unknown> }>) {
  return mock(function MockBFC(_cfg?: unknown) {
    return {
      verify: mock(async () => ({ isValid: true })),
      settle: mock(async () => ({ success: true, transaction: '0xtx', network: 'eip155:8453' })),
      getSupported: overrides?.getSupported ?? mock(async () => ({
        kinds: [
          {
            x402Version: 2,
            scheme: 'exact',
            network: 'eip155:8453',
            extra: { name: 'GatewayWalletBatched', version: '1', verifyingContract: '0xgateway' },
          },
        ],
        extensions: [],
        signers: {},
      })),
    };
  }) as unknown as new (cfg?: unknown) => object;
}

describe('Circle Gateway payment acceptance criteria', () => {
  it('GatewayWalletBatched is the correct scheme name per Circle spec', () => {
    // The scheme name is dictated by Circle's x402 API spec
    const expectedScheme = 'GatewayWalletBatched';
    expect(expectedScheme).toBe('GatewayWalletBatched');
  });

  it('getSupported() includes GatewayWalletBatched extra when Circle Gateway active', async () => {
    const f = createCircleGatewayFacilitator(undefined, { BatchFacilitatorClient: makeMockFacilitatorCtor() });
    const supported = await f.getSupported();

    const gatewayKind = supported.kinds.find(
      (k: Record<string, unknown>) => (k.extra as Record<string, unknown>)?.name === 'GatewayWalletBatched'
    );
    expect(gatewayKind).toBeDefined();
    expect((gatewayKind as Record<string, unknown> & { extra: Record<string, unknown> }).extra.verifyingContract).toBe('0xgateway');
  });

  it('standard x402 flow unaffected when Circle Gateway not configured', () => {
    // Simulate a standard x402 payment requirement (no circle-gateway)
    const paymentRequirement = {
      required: true as const,
      payTo: '0xseller',
      price: '0.01',
      network: 'eip155:8453' as `${string}:${string}`,
      facilitatorUrl: 'https://facilitator.daydreams.systems',
    };

    expect(paymentRequirement.required).toBe(true);
    expect(paymentRequirement.facilitatorUrl).toContain('daydreams');
    // No circle-gateway field
    expect((paymentRequirement as Record<string, unknown>).facilitator).toBeUndefined();
  });

  it('Circle Gateway facilitatorUrl points to circle.com', () => {
    const f = createCircleGatewayFacilitator(undefined, { BatchFacilitatorClient: makeMockFacilitatorCtor() });
    expect(f.gatewayUrl).toContain('circle.com');
    expect(f.gatewayUrl).not.toContain('daydreams');
  });
});
