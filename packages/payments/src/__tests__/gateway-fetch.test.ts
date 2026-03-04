import { describe, expect, it, mock } from 'bun:test';
import { createGatewayFetch } from '../gateway/fetch';
import type { CircleGatewayClientDeps } from '../gateway/types';

const PRIVATE_KEY =
  '0x1111111111111111111111111111111111111111111111111111111111111111' as const;

function createDeps() {
  const batchSignerArgs: unknown[] = [];
  const gatewayConfigs: Array<{ chain: string; privateKey: string; rpcUrl?: string }> = [];
  const getBalances = mock(async () => ({ formattedAvailable: '1.0' }));

  class BatchEvmScheme {
    readonly scheme = 'exact';

    constructor(signer: unknown) {
      batchSignerArgs.push(signer);
    }
  }

  class GatewayClient {
    constructor(config: { chain: string; privateKey: string; rpcUrl?: string }) {
      gatewayConfigs.push(config);
    }

    getBalances = getBalances;
  }

  const deps: CircleGatewayClientDeps = {
    BatchEvmScheme: BatchEvmScheme as any,
    GatewayClient: GatewayClient as any,
  };

  return {
    deps,
    batchSignerArgs,
    gatewayConfigs,
    getBalances,
  };
}

describe('createGatewayFetch', () => {
  it('throws when privateKey is missing', () => {
    const { deps } = createDeps();
    expect(() =>
      createGatewayFetch(
        {
          privateKey: '' as `0x${string}`,
          chain: 'base',
        },
        deps
      )
    ).toThrow('createGatewayFetch requires a non-empty privateKey');
  });

  it('uses GatewayClient with base chain config', () => {
    const { deps, gatewayConfigs } = createDeps();
    createGatewayFetch(
      {
        privateKey: PRIVATE_KEY,
        chain: 'base',
      },
      deps
    );

    expect(gatewayConfigs).toHaveLength(1);
    expect(gatewayConfigs[0]?.chain).toBe('base');
    expect(gatewayConfigs[0]?.privateKey).toBe(PRIVATE_KEY);
  });

  it('normalizes base-sepolia alias to baseSepolia', () => {
    const { deps, gatewayConfigs } = createDeps();
    createGatewayFetch(
      {
        privateKey: PRIVATE_KEY,
        chain: 'base-sepolia',
      },
      deps
    );

    expect(gatewayConfigs[0]?.chain).toBe('baseSepolia');
  });

  it('initializes BatchEvmScheme signer for payment client registration', () => {
    const { deps, batchSignerArgs } = createDeps();
    createGatewayFetch(
      {
        privateKey: PRIVATE_KEY,
        chain: 'base',
      },
      deps
    );

    expect(batchSignerArgs).toHaveLength(1);
    expect(batchSignerArgs[0]).toBeTruthy();
  });

  it('exposes preconnect that calls GatewayClient.getBalances()', async () => {
    const { deps, getBalances } = createDeps();
    const gatewayFetch = createGatewayFetch(
      {
        privateKey: PRIVATE_KEY,
        chain: 'base',
      },
      deps
    );

    await gatewayFetch.preconnect();

    expect(getBalances).toHaveBeenCalledTimes(1);
  });
});
