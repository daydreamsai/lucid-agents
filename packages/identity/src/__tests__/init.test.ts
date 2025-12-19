import { afterEach, describe, expect, it, mock } from 'bun:test';

import {
  type AgentIdentity,
  createAgentIdentity,
  getTrustConfig,
  registerAgent,
} from '../init';
import type { PublicClientLike } from '../registries/identity';

// Track if we're in an identity test to scope the mock
// This prevents the mock from affecting other test suites
let currentTestPublicClient: any = null;

// Mock viem module - only affects behavior when currentTestPublicClient is set
// This allows other tests (like wallet connector tests) to use real viem
mock.module('viem', () => {
  // Lazy load real viem - only when needed for non-identity tests
  let realViem: any = null;
  const getRealViem = () => {
    if (!realViem) {
      // Use require to get real viem synchronously
      realViem = require('viem');
    }
    return realViem;
  };

  return {
    // Mock createPublicClient only when in identity test context
    createPublicClient: (...args: any[]) => {
      if (currentTestPublicClient) {
        return currentTestPublicClient;
      }
      // Use real implementation for non-identity tests
      const viem = getRealViem();
      return viem.createPublicClient(...args);
    },
    // Always use real createWalletClient - identity tests use connector.getWalletClient()
    createWalletClient: (...args: any[]) => {
      const viem = getRealViem();
      return viem.createWalletClient(...args);
    },
    // Mock http transport only when in identity test context
    http: (url: string) => {
      if (currentTestPublicClient) {
        return {
          request: async () => {
            throw new Error(
              'Mock transport - connector should provide clients via getWalletClient()'
            );
          },
        };
      }
      // Use real http transport for non-identity tests
      const viem = getRealViem();
      return viem.http(url);
    },
    // Re-export other viem exports that might be needed
    getAddress: (...args: any[]) => {
      const viem = getRealViem();
      return viem.getAddress?.(...args);
    },
    toAccount: (...args: any[]) => {
      const viem = getRealViem();
      return viem.toAccount?.(...args);
    },
  };
});

mock.module('viem/accounts', () => ({
  privateKeyToAccount: () => ({
    address: '0x0000000000000000000000000000000000000000',
  }),
}));

mock.module('viem/chains', () => ({}));

const REGISTRY_ADDRESS = '0x000000000000000000000000000000000000dEaD' as const;

// Registered event signature: keccak256("Registered(uint256,string,address)")
const REGISTERED_EVENT_SIG =
  '0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a' as const;

// Clean up test state after each test to prevent mock from affecting other tests
afterEach(() => {
  currentTestPublicClient = null;
});

function createMockRuntime(
  address = '0x0000000000000000000000000000000000000007'
) {
  const agentId = BigInt(`0x${address.slice(-1)}`);

  const mockWalletClient = {
    account: {
      address: address as `0x${string}`,
      async signMessage({ message }: { message: string | Uint8Array }) {
        return '0xsignature' as `0x${string}`;
      },
    },
    async writeContract() {
      return '0xtxhash' as `0x${string}`;
    },
    async signMessage() {
      return '0xsignature' as `0x${string}`;
    },
    async request({ method, params }: { method: string; params: any[] }) {
      if (method === 'personal_sign') {
        return '0xsignature';
      }
      if (method === 'eth_sendTransaction') {
        return '0xtxhash';
      }
      throw new Error(`Unsupported method: ${method}`);
    },
  };

  const agentIdHex = `0x000000000000000000000000000000000000000000000000000000000000000${address.slice(-1)}`;

  const mockPublicClient = {
    async readContract({ functionName }: { functionName: string }) {
      // Throw error for ownerOf to indicate agent doesn't exist (will trigger registration)
      if (functionName === 'ownerOf') {
        throw new Error('ERC721NonexistentToken');
      }
      if (functionName === 'tokenURI') {
        return 'https://example.com/.well-known/agent-metadata.json';
      }
      return true;
    },
    async waitForTransactionReceipt({ hash }: { hash: string }) {
      return {
        logs: [
          {
            address: REGISTRY_ADDRESS,
            topics: [REGISTERED_EVENT_SIG, agentIdHex, agentIdHex],
            data: '0x',
          },
        ],
      };
    },
  };

  // Set currentTestPublicClient so the mock uses this client
  currentTestPublicClient = mockPublicClient;

  return {
    wallets: {
      developer: {
        kind: 'local' as const,
        connector: {
          async getWalletMetadata() {
            return { address };
          },
          async signChallenge() {
            return '0xsignature';
          },
          async getWalletClient() {
            return mockWalletClient;
          },
          async getPublicClient() {
            return mockPublicClient;
          },
        },
      },
      agent: {
        kind: 'local' as const,
        connector: {
          async getWalletMetadata() {
            return { address };
          },
          async signChallenge() {
            return '0xsignature';
          },
          async getWalletClient() {
            return mockWalletClient;
          },
          async getPublicClient() {
            return mockPublicClient;
          },
        },
      },
    },
  } as any;
}

describe('createAgentIdentity', () => {
  it('registers and returns trust config when autoRegister is true', async () => {
    const mockWalletClient = {
      account: {
        address: '0x0000000000000000000000000000000000000007' as const,
        async signMessage({ message }: { message: string | Uint8Array }) {
          return '0xsignature' as const;
        },
      },
      async writeContract() {
        return '0xtxhash' as const;
      },
      async signMessage(args: any) {
        return '0xsignature';
      },
    };

    const publicClient = {
      async readContract({ functionName }: { functionName: string }) {
        if (functionName === 'ownerOf') {
          throw new Error('ERC721NonexistentToken');
        }
        if (functionName === 'tokenURI') {
          return 'https://example.com/.well-known/agent-metadata.json';
        }
        return true;
      },
      async waitForTransactionReceipt({ hash }: { hash: string }) {
        return {
          logs: [
            {
              address: REGISTRY_ADDRESS,
              topics: [
                REGISTERED_EVENT_SIG,
                '0x0000000000000000000000000000000000000000000000000000000000000007',
                '0x0000000000000000000000000000000000000000000000000000000000000007',
              ],
              data: '0x',
            },
          ],
        };
      },
    };

    const mockRuntime = {
      wallets: {
        developer: {
          kind: 'local' as const,
          connector: {
            async getWalletMetadata() {
              return { address: '0x0000000000000000000000000000000000000007' };
            },
            async signChallenge() {
              return '0xsignature';
            },
            async getWalletClient() {
              return mockWalletClient;
            },
            async getPublicClient() {
              return publicClient;
            },
          },
        },
      },
    } as any;

    currentTestPublicClient = publicClient;
    const result = await createAgentIdentity({
      runtime: mockRuntime,
      domain: 'example.com',
      registryAddress: REGISTRY_ADDRESS,
      chainId: 84532,
      rpcUrl: 'http://localhost:8545',
      autoRegister: true,
      env: {},
    });

    expect(result.didRegister).toBe(true);
    expect(result.status).toContain('Successfully registered');
    expect(result.domain).toBe('example.com');
    expect(result.isNewRegistration).toBe(true);
    expect(result.record?.agentId).toBe(7n); // Parsed from event
    expect(result.trust).toBeDefined(); // Should have trust config now
  });

  it.skip('returns empty when registry lookup fails', async () => {
    const publicClient: PublicClientLike = {
      async readContract() {
        throw new Error('network error');
      },
    };

    const mockWalletClient = {
      account: {
        address: '0x0000000000000000000000000000000000000007' as const,
        async signMessage({ message }: { message: string | Uint8Array }) {
          return '0xsignature' as const;
        },
      },
      async writeContract() {
        return '0xtxhash' as const;
      },
      async signMessage() {
        return '0xsignature' as const;
      },
    };

    const mockRuntime = {
      wallets: {
        developer: {
          kind: 'local' as const,
          connector: {
            async getWalletMetadata() {
              return { address: '0x0000000000000000000000000000000000000007' };
            },
            async signChallenge() {
              return '0xsignature';
            },
            async getWalletClient() {
              return mockWalletClient;
            },
            async getPublicClient() {
              return publicClient;
            },
          },
        },
      },
    } as any;

    const result = await createAgentIdentity({
      runtime: mockRuntime,
      domain: 'fallback.example',
      registryAddress: REGISTRY_ADDRESS,
      rpcUrl: 'http://localhost:8545',
      chainId: 84532,
      env: {},
    });

    expect(result.trust).toBeUndefined();
    expect(result.status).toContain('without on-chain identity');
  });

  it('sets isNewRegistration when registering', async () => {
    let registerCalled = false;

    const walletClient = {
      account: {
        address: '0x0000000000000000000000000000000000000009' as const,
        async signMessage({ message }: { message: string | Uint8Array }) {
          return '0xsignature' as `0x${string}`;
        },
      },
      async writeContract() {
        registerCalled = true;
        return '0x1234567890abcdef' as `0x${string}`;
      },
      async signMessage() {
        return '0xsignature' as `0x${string}`;
      },
    };

    const mockPublicClient = {
      async readContract({ functionName }: { functionName: string }) {
        if (functionName === 'ownerOf') {
          throw new Error('ERC721NonexistentToken');
        }
        if (functionName === 'tokenURI') {
          return 'https://new-agent.example.com/.well-known/agent-metadata.json';
        }
        return true;
      },
      async waitForTransactionReceipt({ hash }: { hash: string }) {
        return {
          logs: [
            {
              address: REGISTRY_ADDRESS,
              topics: [
                REGISTERED_EVENT_SIG,
                '0x0000000000000000000000000000000000000000000000000000000000000009',
                '0x0000000000000000000000000000000000000000000000000000000000000009',
              ],
              data: '0x',
            },
          ],
        };
      },
    };

    const mockRuntime = {
      wallets: {
        developer: {
          kind: 'local' as const,
          connector: {
            async getWalletMetadata() {
              return { address: '0x0000000000000000000000000000000000000009' };
            },
            async signChallenge() {
              return '0xsignature';
            },
            async getWalletClient() {
              return walletClient;
            },
            async getPublicClient() {
              return mockPublicClient;
            },
          },
        },
      },
    } as any;

    currentTestPublicClient = mockPublicClient;
    const result = await createAgentIdentity({
      runtime: mockRuntime,
      domain: 'new-agent.example.com',
      registryAddress: REGISTRY_ADDRESS,
      chainId: 84532,
      rpcUrl: 'http://localhost:8545',
      autoRegister: true,
      env: {},
    });

    expect(registerCalled).toBe(true);
    expect(result.isNewRegistration).toBe(true);
    expect(result.didRegister).toBe(true);
    expect(result.transactionHash).toBe('0x1234567890abcdef');
    expect(result.status).toContain('Successfully registered');
  });

  it('uses environment variables as fallback', async () => {
    const mockWalletClient = {
      account: {
        address: '0x000000000000000000000000000000000000000a' as const,
        async signMessage({ message }: { message: string | Uint8Array }) {
          return '0xsignature' as const;
        },
      },
      async writeContract() {
        return '0xtxhash' as const;
      },
      async signMessage(args: any) {
        return '0xsignature';
      },
    };

    const publicClient = {
      async readContract() {
        return true;
      },
      async waitForTransactionReceipt({ hash }: { hash: string }) {
        return {
          logs: [
            {
              address: REGISTRY_ADDRESS,
              topics: [
                REGISTERED_EVENT_SIG,
                '0x000000000000000000000000000000000000000000000000000000000000000a', // agentId = 10
                '0x000000000000000000000000000000000000000000000000000000000000000a', // owner
              ],
              data: '0x',
            },
          ],
        };
      },
    } as any;

    const result = await createAgentIdentity({
      runtime: createMockRuntime('0x000000000000000000000000000000000000000a'),
      chainId: 84532,
      registryAddress: REGISTRY_ADDRESS,
      rpcUrl: 'http://localhost:8545',
      autoRegister: true,
      env: {
        AGENT_DOMAIN: 'env-agent.example.com',
        ADDRESS: '0x000000000000000000000000000000000000000a',
      },
    });

    expect(result.domain).toBe('env-agent.example.com');
    expect(result.didRegister).toBe(true);
    expect(result.transactionHash).toBeDefined();
  });

  it('applies custom trust models', async () => {
    const mockWalletClient = {
      account: {
        address: '0x000000000000000000000000000000000000000b' as const,
        async signMessage({ message }: { message: string | Uint8Array }) {
          return '0xsignature' as const;
        },
      },
      async writeContract() {
        return '0xtxhash' as const;
      },
      async signMessage(args: any) {
        return '0xsignature';
      },
    };

    const publicClient = {
      async readContract() {
        return true;
      },
      async waitForTransactionReceipt({ hash }: { hash: string }) {
        return {
          logs: [
            {
              address: REGISTRY_ADDRESS,
              topics: [
                REGISTERED_EVENT_SIG,
                '0x000000000000000000000000000000000000000000000000000000000000000b', // agentId = 11
                '0x000000000000000000000000000000000000000000000000000000000000000b', // owner
              ],
              data: '0x',
            },
          ],
        };
      },
    } as any;

    const result = await createAgentIdentity({
      runtime: createMockRuntime('0x000000000000000000000000000000000000000b'),
      domain: 'custom.example.com',
      registryAddress: REGISTRY_ADDRESS,
      chainId: 84532,
      rpcUrl: 'http://localhost:8545',
      autoRegister: true,
      trustModels: ['tee-attestation', 'custom-model'],
      env: {},
    });

    expect(result.didRegister).toBe(true);
    expect(result.transactionHash).toBeDefined();
    expect(result.trust?.trustModels).toEqual([
      'tee-attestation',
      'custom-model',
    ]);
  });

  it('applies custom trust overrides', async () => {
    const mockWalletClient = {
      account: {
        address: '0x000000000000000000000000000000000000000c' as const,
        async signMessage({ message }: { message: string | Uint8Array }) {
          return '0xsignature' as const;
        },
      },
      async writeContract() {
        return '0xtxhash' as const;
      },
      async signMessage(args: any) {
        return '0xsignature';
      },
    };

    const publicClient = {
      async readContract() {
        return true;
      },
      async waitForTransactionReceipt({ hash }: { hash: string }) {
        return {
          logs: [
            {
              address: REGISTRY_ADDRESS,
              topics: [
                REGISTERED_EVENT_SIG,
                '0x000000000000000000000000000000000000000000000000000000000000000c', // agentId = 12
                '0x000000000000000000000000000000000000000000000000000000000000000c', // owner
              ],
              data: '0x',
            },
          ],
        };
      },
    } as any;

    const result = await createAgentIdentity({
      runtime: createMockRuntime('0x000000000000000000000000000000000000000c'),
      domain: 'override.example.com',
      registryAddress: REGISTRY_ADDRESS,
      chainId: 84532,
      rpcUrl: 'http://localhost:8545',
      autoRegister: true,
      trustOverrides: {
        validationRequestsUri: 'https://custom.example.com/requests.json',
        validationResponsesUri: 'https://custom.example.com/responses.json',
        feedbackDataUri: 'https://custom.example.com/feedback.json',
      },
      env: {},
    });

    expect(result.didRegister).toBe(true);
    expect(result.transactionHash).toBeDefined();
    expect(result.trust?.validationRequestsUri).toBe(
      'https://custom.example.com/requests.json'
    );
    expect(result.trust?.validationResponsesUri).toBe(
      'https://custom.example.com/responses.json'
    );
    expect(result.trust?.feedbackDataUri).toBe(
      'https://custom.example.com/feedback.json'
    );
  });
});

describe('registerAgent', () => {
  it('wraps createAgentIdentity with autoRegister forced to true', async () => {
    let registerCalled = false;

    const publicClient = {
      async readContract() {
        return true;
      },
      async waitForTransactionReceipt({ hash }: { hash: string }) {
        return {
          logs: [
            {
              address: REGISTRY_ADDRESS,
              topics: [
                REGISTERED_EVENT_SIG,
                '0x000000000000000000000000000000000000000000000000000000000000000d', // agentId = 13
                '0x000000000000000000000000000000000000000000000000000000000000000d', // owner
              ],
              data: '0x',
            },
          ],
        };
      },
    } as any;

    const mockPublicClient = {
      async readContract({ functionName }: { functionName: string }) {
        if (functionName === 'ownerOf') {
          throw new Error('ERC721NonexistentToken');
        }
        if (functionName === 'tokenURI') {
          return 'https://register.example.com/.well-known/agent-metadata.json';
        }
        return true;
      },
      async waitForTransactionReceipt({ hash }: { hash: string }) {
        return {
          logs: [
            {
              address: REGISTRY_ADDRESS,
              topics: [
                REGISTERED_EVENT_SIG,
                '0x000000000000000000000000000000000000000000000000000000000000000d',
                '0x000000000000000000000000000000000000000000000000000000000000000d',
              ],
              data: '0x',
            },
          ],
        };
      },
    };

    const walletClient = {
      account: {
        address: '0x000000000000000000000000000000000000000d' as const,
        async signMessage({ message }: { message: string | Uint8Array }) {
          return '0xsignature' as `0x${string}`;
        },
      },
      async writeContract() {
        registerCalled = true;
        return '0xabcdef' as `0x${string}`;
      },
      async signMessage(args: any) {
        return '0xsignature';
      },
      async request({ method }: { method: string }) {
        if (method === 'personal_sign') return '0xsignature';
        if (method === 'eth_sendTransaction') return '0xabcdef';
        throw new Error(`Unsupported method: ${method}`);
      },
    };

    const mockRuntime = createMockRuntime(
      '0x000000000000000000000000000000000000000d'
    );
    (mockRuntime.wallets.developer.connector as any).getWalletClient =
      async () => walletClient;
    (mockRuntime.wallets.developer.connector as any).getPublicClient =
      async () => mockPublicClient;

    const result = await registerAgent({
      runtime: mockRuntime,
      domain: 'register.example.com',
      registryAddress: REGISTRY_ADDRESS,
      chainId: 84532,
      rpcUrl: 'http://localhost:8545',
      env: {},
    });

    expect(registerCalled).toBe(true);
    expect(result.didRegister).toBe(true);
    expect(result.transactionHash).toBeDefined();
  });
});

describe('getTrustConfig', () => {
  it('extracts trust config from result', () => {
    const mockResult: AgentIdentity = {
      status: 'test',
      trust: {
        registrations: [
          {
            agentId: '1',
            agentAddress:
              'eip155:84532:0x0000000000000000000000000000000000000001',
          },
        ],
        trustModels: ['feedback'],
      },
      record: {
        agentId: 1n,
        owner: '0x0000000000000000000000000000000000000001',
        tokenURI: 'https://test.example.com/.well-known/agent-metadata.json',
      },
    };

    const trust = getTrustConfig(mockResult);

    expect(trust).toBeDefined();
    expect(trust?.registrations?.[0].agentId).toBe('1');
    expect(trust?.trustModels).toEqual(['feedback']);
  });

  it('returns undefined when trust is not present', () => {
    const mockResult: AgentIdentity = {
      status: 'unavailable',
    };

    const trust = getTrustConfig(mockResult);

    expect(trust).toBeUndefined();
  });
});
