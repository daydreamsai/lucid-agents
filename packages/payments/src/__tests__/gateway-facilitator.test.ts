import { describe, expect, it, mock } from 'bun:test';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import {
  createCircleGatewayFacilitator,
  createPaymentSchemeRegistrations,
  createPaymentsFacilitatorClient,
  isCircleGatewayFacilitator,
} from '../gateway/facilitator';
import type { CircleGatewayFacilitatorDeps } from '../gateway/types';

const basePaymentsConfig: PaymentsConfig = {
  payTo: '0xabc0000000000000000000000000000000000000',
  facilitatorUrl: 'https://facilitator.test',
  network: 'eip155:8453',
};

function createDeps(overrides?: Partial<CircleGatewayFacilitatorDeps>) {
  const batchVerify = mock(async () => ({ isValid: true }));
  const batchSettle = mock(async () => ({
    success: true,
    transaction: '0xbatch',
    network: 'eip155:8453',
  }));
  const batchSupported = mock(async () => ({
    kinds: [
      {
        x402Version: 2,
        scheme: 'exact',
        network: 'eip155:8453',
        extra: {
          name: 'GatewayWalletBatched',
          version: '1',
          verifyingContract: '0x0000000000000000000000000000000000000001',
        },
      },
    ],
    extensions: ['batching'],
    signers: { exact: ['0xbatch'] },
  }));

  const standardVerify = mock(async () => ({ isValid: true }));
  const standardSettle = mock(async () => ({
    success: true,
    transaction: '0xstandard',
    network: 'eip155:8453',
  }));
  const standardSupported = mock(async () => ({
    kinds: [
      {
        x402Version: 2,
        scheme: 'exact',
        network: 'eip155:8453',
      },
      {
        x402Version: 2,
        scheme: 'exact',
        network: 'eip155:11155111',
      },
    ],
    extensions: ['standard'],
    signers: { exact: ['0xstandard'] },
  }));

  class BatchFacilitatorClient {
    verify = batchVerify;
    settle = batchSettle;
    getSupported = batchSupported;
  }

  class GatewayEvmScheme {}

  const deps: CircleGatewayFacilitatorDeps = {
    BatchFacilitatorClient: BatchFacilitatorClient as any,
    GatewayEvmScheme: GatewayEvmScheme as any,
    isBatchPayment: requirements =>
      requirements?.extra?.name === 'GatewayWalletBatched',
    createStandardFacilitatorClient: () => ({
      verify: standardVerify as any,
      settle: standardSettle as any,
      getSupported: standardSupported as any,
    }),
    ...overrides,
  };

  return {
    deps,
    batchVerify,
    batchSettle,
    batchSupported,
    standardVerify,
    standardSettle,
    standardSupported,
  };
}

describe('gateway facilitator helpers', () => {
  it('detects circle gateway facilitator mode', () => {
    expect(
      isCircleGatewayFacilitator({
        ...basePaymentsConfig,
        facilitator: 'circle-gateway',
      })
    ).toBe(true);
    expect(isCircleGatewayFacilitator(basePaymentsConfig)).toBe(false);
  });

  it('routes verify to batch facilitator when requirements are batched', async () => {
    const { deps, batchVerify, standardVerify } = createDeps();
    const facilitator = createCircleGatewayFacilitator(
      {
        payments: {
          ...basePaymentsConfig,
          facilitator: 'circle-gateway',
        },
      },
      deps
    );

    await facilitator.verify(
      { x402Version: 2, payload: {} } as any,
      {
        scheme: 'exact',
        network: 'eip155:8453',
        extra: { name: 'GatewayWalletBatched', version: '1' },
      } as any
    );

    expect(batchVerify).toHaveBeenCalledTimes(1);
    expect(standardVerify).toHaveBeenCalledTimes(0);
  });

  it('routes settle to standard facilitator for non-batched requirements', async () => {
    const { deps, batchSettle, standardSettle } = createDeps();
    const facilitator = createCircleGatewayFacilitator(
      {
        payments: {
          ...basePaymentsConfig,
          facilitator: 'circle-gateway',
        },
      },
      deps
    );

    await facilitator.settle(
      { x402Version: 2, payload: {} } as any,
      {
        scheme: 'exact',
        network: 'eip155:8453',
      } as any
    );

    expect(batchSettle).toHaveBeenCalledTimes(0);
    expect(standardSettle).toHaveBeenCalledTimes(1);
  });

  it('propagates settle errors from batch facilitator', async () => {
    const settleError = new Error('batch settle failed');
    const { deps } = createDeps({
      BatchFacilitatorClient: class {
        verify = mock(async () => ({ isValid: true }));
        settle = mock(async () => {
          throw settleError;
        });
        getSupported = mock(async () => ({
          kinds: [],
          extensions: [],
          signers: {},
        }));
      } as any,
    });
    const facilitator = createCircleGatewayFacilitator(
      {
        payments: {
          ...basePaymentsConfig,
          facilitator: 'circle-gateway',
        },
      },
      deps
    );

    await expect(
      facilitator.settle(
        { x402Version: 2, payload: {} } as any,
        {
          scheme: 'exact',
          network: 'eip155:8453',
          extra: { name: 'GatewayWalletBatched', version: '1' },
        } as any
      )
    ).rejects.toThrow('batch settle failed');
  });

  it('merges supported kinds with batch precedence', async () => {
    const { deps } = createDeps();
    const facilitator = createCircleGatewayFacilitator(
      {
        payments: {
          ...basePaymentsConfig,
          facilitator: 'circle-gateway',
        },
      },
      deps
    );

    const supported = await facilitator.getSupported();

    expect(supported.kinds).toHaveLength(2);
    expect(supported.kinds[0].extra?.name).toBe('GatewayWalletBatched');
    expect(supported.extensions).toEqual(['batching', 'standard']);
    expect(supported.signers.exact).toContain('0xbatch');
    expect(supported.signers.exact).toContain('0xstandard');
  });

  it('falls back to standard supported response when batch supported fails', async () => {
    const { deps } = createDeps({
      BatchFacilitatorClient: class {
        verify = mock(async () => ({ isValid: true }));
        settle = mock(async () => ({ success: true }));
        getSupported = mock(async () => {
          throw new Error('batch unavailable');
        });
      } as any,
    });
    const facilitator = createCircleGatewayFacilitator(
      {
        payments: {
          ...basePaymentsConfig,
          facilitator: 'circle-gateway',
        },
      },
      deps
    );

    const supported = await facilitator.getSupported();
    expect(supported.kinds).toHaveLength(2);
    expect(supported.extensions).toEqual(['standard']);
  });

  it('throws when both supported calls fail', async () => {
    const { deps } = createDeps({
      BatchFacilitatorClient: class {
        verify = mock(async () => ({ isValid: true }));
        settle = mock(async () => ({
          success: true,
          transaction: '0xbatch',
          network: 'eip155:8453',
        }));
        getSupported = mock(async () => {
          throw new Error('batch failed');
        });
      } as any,
      createStandardFacilitatorClient: () => ({
        verify: mock(async () => ({ isValid: true })),
        settle: mock(async () => ({
          success: true,
          transaction: '0xstandard',
          network: 'eip155:8453' as `${string}:${string}`,
        })),
        getSupported: mock(async () => {
          throw new Error('standard failed');
        }),
      }),
    });
    const facilitator = createCircleGatewayFacilitator(
      {
        payments: {
          ...basePaymentsConfig,
          facilitator: 'circle-gateway',
        },
      },
      deps
    );

    await expect(facilitator.getSupported()).rejects.toThrow('batch failed');
  });

  it('returns default exact scheme registration when circle gateway is disabled', () => {
    const registrations = createPaymentSchemeRegistrations(basePaymentsConfig);

    expect(registrations).toHaveLength(1);
    expect(registrations[0].network).toBe('eip155:*');
    expect((registrations[0].server as { constructor: { name: string } }).constructor.name).toBe(
      'ExactEvmScheme'
    );
  });

  it('returns gateway scheme registration when circle gateway is enabled', () => {
    const { deps } = createDeps();
    const registrations = createPaymentSchemeRegistrations(
      {
        ...basePaymentsConfig,
        facilitator: 'circle-gateway',
      },
      deps
    );

    expect(registrations).toHaveLength(1);
    expect((registrations[0].server as { constructor: { name: string } }).constructor.name).toBe(
      'GatewayEvmScheme'
    );
  });

  it('createPaymentsFacilitatorClient routes circle mode to batch client path', async () => {
    const { deps, batchSettle } = createDeps();
    const facilitator = createPaymentsFacilitatorClient(
      {
        payments: {
          ...basePaymentsConfig,
          facilitator: 'circle-gateway',
        },
      },
      deps
    );

    await facilitator.settle(
      { x402Version: 2, payload: {} } as any,
      {
        scheme: 'exact',
        network: 'eip155:8453',
        extra: { name: 'GatewayWalletBatched', version: '1' },
      } as any
    );

    expect(batchSettle).toHaveBeenCalledTimes(1);
  });
});
