import { describe, expect, it } from 'bun:test';

import { createIdentityRegistryClient, toCaip10 } from '../registries/identity';
import {
  createTronPublicClient,
  createTronWalletClient,
  makeTronClientFactory,
} from '../tron/client';
import {
  getTronRegistryAddresses,
  TRON_CHAINS,
  TRON_NAMESPACE,
} from '../tron/config';
import type { TronContractLike, TronWebLike } from '../tron/types';

/**
 * Create a mock TronWeb instance that records contract method calls.
 */
function createMockTronWeb(options?: {
  callResults?: Record<string, unknown>;
  sendResults?: Record<string, string>;
  defaultBase58?: string;
  defaultHex?: string;
}): TronWebLike & { calls: Array<{ method: string; args: unknown[] }> } {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const callResults = options?.callResults ?? {};
  const sendResults = options?.sendResults ?? {};

  return {
    calls,
    defaultAddress: {
      base58: options?.defaultBase58 ?? 'TFKNqk9bjwWp5uRiiGimqfLhVQB8jSxYi7',
      hex: options?.defaultHex ?? '413aa92963de476e4c7f10e070d4cc99ed93602da2',
    },
    async contract(
      _abi: readonly unknown[],
      _address: string
    ): Promise<TronContractLike> {
      return {
        methods: new Proxy(
          {},
          {
            get(_target, functionName: string) {
              return (...args: unknown[]) => ({
                async call() {
                  calls.push({ method: functionName, args });
                  if (functionName in callResults) {
                    return callResults[functionName];
                  }
                  throw new Error(`No mock result for ${functionName}`);
                },
                async send() {
                  calls.push({ method: functionName, args });
                  if (functionName in sendResults) {
                    return sendResults[functionName];
                  }
                  return 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd';
                },
              });
            },
          }
        ) as TronContractLike['methods'],
      };
    },
  };
}

describe('createTronPublicClient', () => {
  it('delegates readContract to TronWeb contract methods', async () => {
    const mockTronWeb = createMockTronWeb({
      callResults: {
        ownerOf: '0xAaAA000000000000000000000000000000000001',
      },
    });

    const publicClient = createTronPublicClient(mockTronWeb);

    // Use the Shasta identity registry address
    const addrs = getTronRegistryAddresses(TRON_CHAINS.SHASTA);

    const result = await publicClient.readContract({
      address: addrs.IDENTITY_REGISTRY,
      abi: [],
      functionName: 'ownerOf',
      args: [1n],
    });

    expect(result).toBe('0xAaAA000000000000000000000000000000000001');
    expect(mockTronWeb.calls).toHaveLength(1);
    expect(mockTronWeb.calls[0].method).toBe('ownerOf');
    expect(mockTronWeb.calls[0].args).toEqual([1n]);
  });

  it('caches contract instances by address', async () => {
    let contractCreations = 0;
    const mockTronWeb: TronWebLike = {
      defaultAddress: {
        base58: 'TFKNqk9bjwWp5uRiiGimqfLhVQB8jSxYi7',
        hex: '413aa92963de476e4c7f10e070d4cc99ed93602da2',
      },
      async contract() {
        contractCreations++;
        return {
          methods: new Proxy(
            {},
            {
              get(_t, name: string) {
                return () => ({
                  async call() {
                    return 'ok';
                  },
                  async send() {
                    return 'tx';
                  },
                });
              },
            }
          ) as TronContractLike['methods'],
        };
      },
    };

    const publicClient = createTronPublicClient(mockTronWeb);
    const addrs = getTronRegistryAddresses(TRON_CHAINS.SHASTA);

    await publicClient.readContract({
      address: addrs.IDENTITY_REGISTRY,
      abi: [],
      functionName: 'ownerOf',
      args: [1n],
    });
    await publicClient.readContract({
      address: addrs.IDENTITY_REGISTRY,
      abi: [],
      functionName: 'tokenURI',
      args: [1n],
    });

    // Should reuse the cached contract
    expect(contractCreations).toBe(1);
  });
});

describe('createTronWalletClient', () => {
  it('sets account address from TronWeb defaultAddress', () => {
    const mockTronWeb = createMockTronWeb({
      defaultHex: '413aa92963de476e4c7f10e070d4cc99ed93602da2',
    });

    const walletClient = createTronWalletClient(mockTronWeb);

    // Account address should be the EVM hex equivalent (strip 41 prefix)
    expect(walletClient.account?.address).toBe(
      '0x3aa92963de476e4c7f10e070d4cc99ed93602da2'
    );
  });

  it('delegates writeContract to TronWeb contract send', async () => {
    const expectedTxId =
      'abc123def456abc123def456abc123def456abc123def456abc123def456abcd';
    const mockTronWeb = createMockTronWeb({
      sendResults: { register: expectedTxId },
    });

    const walletClient = createTronWalletClient(mockTronWeb);
    const addrs = getTronRegistryAddresses(TRON_CHAINS.SHASTA);

    const txHash = await walletClient.writeContract({
      address: addrs.IDENTITY_REGISTRY,
      abi: [],
      functionName: 'register',
      args: ['https://example.com/agent.json'],
    });

    expect(txHash).toBe(`0x${expectedTxId}`);
    expect(mockTronWeb.calls).toHaveLength(1);
    expect(mockTronWeb.calls[0].method).toBe('register');
  });
});

describe('TRON + createIdentityRegistryClient integration', () => {
  it('creates a working identity registry client with TRON adapters', async () => {
    const mockTronWeb = createMockTronWeb({
      callResults: {
        ownerOf: '0xAaAA000000000000000000000000000000000001',
        tokenURI: 'https://example.com/agent-registration.json',
      },
    });

    const addrs = getTronRegistryAddresses(TRON_CHAINS.SHASTA);

    const client = createIdentityRegistryClient({
      address: addrs.IDENTITY_REGISTRY,
      chainId: TRON_CHAINS.SHASTA,
      namespace: TRON_NAMESPACE,
      publicClient: createTronPublicClient(mockTronWeb),
      walletClient: createTronWalletClient(mockTronWeb),
    });

    expect(client.address).toBe(addrs.IDENTITY_REGISTRY);
    expect(client.chainId).toBe(TRON_CHAINS.SHASTA);

    // Test reading an identity
    const record = await client.get(1n);
    expect(record).not.toBeNull();
    expect(record!.agentId).toBe(1n);
    expect(record!.agentURI).toBe(
      'https://example.com/agent-registration.json'
    );
  });

  it('generates CAIP-10 with tron namespace', () => {
    const addrs = getTronRegistryAddresses(TRON_CHAINS.SHASTA);

    const caip10 = toCaip10({
      namespace: TRON_NAMESPACE,
      chainId: TRON_CHAINS.SHASTA,
      address: addrs.IDENTITY_REGISTRY,
    });

    expect(caip10).toMatch(/^tron:2494104990:0x[0-9a-f]{40}$/);
    expect(caip10).toContain('tron:');
    expect(caip10).toContain(':2494104990:');
  });

  it('generates RegistrationEntry with tron namespace', async () => {
    const mockTronWeb = createMockTronWeb({
      callResults: {
        ownerOf: '0xAaAA000000000000000000000000000000000001',
        tokenURI: 'https://example.com/agent.json',
      },
    });

    const addrs = getTronRegistryAddresses(TRON_CHAINS.SHASTA);

    const client = createIdentityRegistryClient({
      address: addrs.IDENTITY_REGISTRY,
      chainId: TRON_CHAINS.SHASTA,
      namespace: TRON_NAMESPACE,
      publicClient: createTronPublicClient(mockTronWeb),
    });

    const record = await client.get(1n);
    expect(record).not.toBeNull();

    const entry = client.toRegistrationEntry(record!);
    expect(entry.agentRegistry).toContain('tron:');
    expect(entry.agentRegistry).toContain(`:${TRON_CHAINS.SHASTA}:`);
  });
});

describe('makeTronClientFactory', () => {
  it('returns a factory that produces public and wallet clients', async () => {
    const mockTronWeb = createMockTronWeb();
    const factory = makeTronClientFactory(mockTronWeb);

    const clients = await factory({
      chainId: TRON_CHAINS.SHASTA,
      rpcUrl: 'https://api.shasta.trongrid.io',
      env: {},
    });

    expect(clients).not.toBeNull();
    expect(clients!.publicClient).toBeDefined();
    expect(clients!.walletClient).toBeDefined();
  });
});

describe('getTronRegistryAddresses', () => {
  it('returns addresses for Mainnet', () => {
    const addrs = getTronRegistryAddresses(TRON_CHAINS.MAINNET);
    expect(addrs.IDENTITY_REGISTRY).toMatch(/^0x[0-9a-f]{40}$/);
    expect(addrs.REPUTATION_REGISTRY).toMatch(/^0x[0-9a-f]{40}$/);
    expect(addrs.VALIDATION_REGISTRY).toMatch(/^0x[0-9a-f]{40}$/);
  });

  it('returns addresses for Shasta', () => {
    const addrs = getTronRegistryAddresses(TRON_CHAINS.SHASTA);
    expect(addrs.IDENTITY_REGISTRY).toMatch(/^0x[0-9a-f]{40}$/);
    expect(addrs.REPUTATION_REGISTRY).toMatch(/^0x[0-9a-f]{40}$/);
    expect(addrs.VALIDATION_REGISTRY).toMatch(/^0x[0-9a-f]{40}$/);
  });

  it('throws for unsupported chain', () => {
    expect(() => getTronRegistryAddresses(999999)).toThrow(
      'TRON chain ID 999999 is not supported'
    );
  });
});
