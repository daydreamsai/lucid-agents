import { describe, expect, it } from 'bun:test';

import {
  bootstrapIdentity,
  bootstrapTrust,
  buildMetadataURI,
  buildTrustConfigFromIdentity,
  createIdentityRegistryClient,
  type IdentityRecord,
  type PublicClientLike,
  signAgentDomainProof,
  toCaip10,
  type WalletClientLike,
} from '../registries/identity';

const REGISTRY_ADDRESS = '0x000000000000000000000000000000000000dEaD' as const;

// Registered event signature: keccak256("Registered(uint256,string,address)")
const REGISTERED_EVENT_SIG =
  '0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a' as const;

describe('buildMetadataURI', () => {
  it('constructs metadata URI from domain', () => {
    expect(buildMetadataURI('agent.example.com')).toBe(
      'https://agent.example.com/.well-known/agent-metadata.json'
    );
  });

  it('handles domains with https protocol', () => {
    expect(buildMetadataURI('https://agent.example.com')).toBe(
      'https://agent.example.com/.well-known/agent-metadata.json'
    );
  });

  it('normalizes domain', () => {
    expect(buildMetadataURI('  Agent.Example.COM  ')).toBe(
      'https://agent.example.com/.well-known/agent-metadata.json'
    );
  });
});

describe('createIdentityRegistryClient', () => {
  it('gets agent by ID using ownerOf and tokenURI', async () => {
    const calls: Array<{ functionName: string; args: readonly unknown[] }> = [];
    const mockPublicClient = {
      async readContract(args: any) {
        calls.push({ functionName: args.functionName, args: args.args ?? [] });

        if (args.functionName === 'agentExists') {
          return true;
        }
        if (args.functionName === 'ownerOf') {
          return '0xAaAA000000000000000000000000000000000001';
        }
        if (args.functionName === 'tokenURI') {
          return 'https://agent.example.com/.well-known/agent-metadata.json';
        }
        throw new Error(`Unexpected function: ${args.functionName}`);
      },
    } as PublicClientLike;

    const client = createIdentityRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient: mockPublicClient,
    });

    const record = await client.get(1n);
    expect(record?.agentId).toBe(1n);
    expect(record?.owner).toBe('0xaaaa000000000000000000000000000000000001');
    expect(record?.tokenURI).toBe(
      'https://agent.example.com/.well-known/agent-metadata.json'
    );

    expect(calls).toContainEqual({
      functionName: 'agentExists',
      args: [1n],
    });
    expect(calls).toContainEqual({
      functionName: 'ownerOf',
      args: [1n],
    });
    expect(calls).toContainEqual({
      functionName: 'tokenURI',
      args: [1n],
    });
  });

  it("returns null when agent doesn't exist", async () => {
    const mockPublicClient = {
      async readContract(args: any) {
        if (args.functionName === 'agentExists') {
          return false;
        }
        throw new Error('Should not be called');
      },
    } as PublicClientLike;

    const client = createIdentityRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient: mockPublicClient,
    });

    const record = await client.get(999n);
    expect(record).toBeNull();
  });

  it('registers agent with tokenURI', async () => {
    let writeArgs: any;
    const mockWalletClient = {
      account: {
        address: '0x0000000000000000000000000000000000001234' as const,
      },
      async writeContract(args: any) {
        writeArgs = args;
        return '0xtxhash' as const;
      },
    } as WalletClientLike;

    const mockPublicClient = {
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
                '0x000000000000000000000000000000000000000000000000000000000000002a', // agentId = 42
                '0x0000000000000000000000000000000000000000000000000000000000001234', // owner
              ],
              data: '0x',
            },
          ],
        };
      },
    } as any;

    const client = createIdentityRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient: mockPublicClient,
      walletClient: mockWalletClient,
    });

    const result = await client.register({
      tokenURI: 'https://agent.example.com/.well-known/agent-metadata.json',
    });

    expect(result.transactionHash).toBe('0xtxhash');
    expect(result.agentAddress).toBe(
      '0x0000000000000000000000000000000000001234'
    );
    expect(result.agentId).toBe(42n); // Parsed from event!
    expect(writeArgs.functionName).toBe('register');
    expect(writeArgs.args).toEqual([
      'https://agent.example.com/.well-known/agent-metadata.json',
    ]);
  });

  it('registers agent with tokenURI and metadata', async () => {
    let writeArgs: any;
    const mockWalletClient = {
      account: {
        address: '0x0000000000000000000000000000000000001234' as const,
      },
      async writeContract(args: any) {
        writeArgs = args;
        return '0xtxhash' as const;
      },
    } as WalletClientLike;

    const mockPublicClient = {
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
                '0x0000000000000000000000000000000000000000000000000000000000000064', // agentId = 100
                '0x0000000000000000000000000000000000000000000000000000000000001234', // owner
              ],
              data: '0x',
            },
          ],
        };
      },
    } as any;

    const client = createIdentityRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient: mockPublicClient,
      walletClient: mockWalletClient,
    });

    const metadata = [{ key: 'version', value: new Uint8Array([1, 0, 0]) }];

    const result = await client.register({
      tokenURI: 'https://agent.example.com/.well-known/agent-metadata.json',
      metadata,
    });

    expect(result.transactionHash).toBe('0xtxhash');
    expect(result.agentId).toBe(100n); // Parsed from event!
    expect(writeArgs.functionName).toBe('register');
    expect(writeArgs.args).toEqual([
      'https://agent.example.com/.well-known/agent-metadata.json',
      metadata,
    ]);
  });
});

describe('buildTrustConfigFromIdentity', () => {
  it('builds CAIP-10 registration entries', () => {
    const trust = buildTrustConfigFromIdentity(
      {
        agentId: 5n,
        owner: '0x0000000000000000000000000000000000000005',
        tokenURI: 'https://agent.example.com/.well-known/agent-metadata.json',
      },
      { chainId: 84532 }
    );
    expect(trust.registrations?.[0]).toEqual({
      agentId: '5',
      agentAddress: 'eip155:84532:0x0000000000000000000000000000000000000005',
    });
  });

  it('preserves large agent identifiers as strings', () => {
    const largeId = (1n << 100n) - 1n;
    const trust = buildTrustConfigFromIdentity(
      {
        agentId: largeId,
        owner: '0x0000000000000000000000000000000000000abc',
        tokenURI: 'https://agent.example.com/.well-known/agent-metadata.json',
      },
      { chainId: 84532 }
    );

    expect(trust.registrations?.[0].agentId).toBe(largeId.toString());
  });
});

describe('signAgentDomainProof', () => {
  it('signs ownership messages via provided signer', async () => {
    let capturedHexMessage: string | undefined;

    const signer = {
      account: {
        address: '0x0000000000000000000000000000000000001234' as const,
      },
      async request({ method, params }: any) {
        if (method === 'personal_sign') {
          capturedHexMessage = params[0];
          return '0xsignature';
        }
        throw new Error(`Unexpected method: ${method}`);
      },
    };

    const signature = await signAgentDomainProof({
      domain: 'Agent.Example.com',
      address: '0x0000000000000000000000000000000000001234',
      chainId: 84532,
      signer: signer as any,
    });

    expect(signature).toBe('0xsignature');

    // Viem hex-encodes the message before signing, so decode it to check
    if (capturedHexMessage?.startsWith('0x')) {
      const decoded = Buffer.from(capturedHexMessage.slice(2), 'hex').toString(
        'utf8'
      );
      expect(decoded).toContain('ERC-8004 Agent Ownership Proof');
      expect(decoded).toContain('agent.example.com'); // normalized domain
    } else {
      throw new Error('Expected hex-encoded message from Viem');
    }
  });
});

describe('bootstrapTrust', () => {
  it('registers agent when registerIfMissing is true', async () => {
    let registeredTokenURI: string | undefined;

    const mockWalletClient = {
      account: {
        address: '0x0000000000000000000000000000000000000007' as const,
      },
      async writeContract(args: any) {
        registeredTokenURI = args.args[0];
        return '0xtxhash' as const;
      },
      async signMessage(args: any) {
        return '0xsignature';
      },
    } as WalletClientLike;

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
                '0x0000000000000000000000000000000000000000000000000000000000000007', // agentId = 7
                '0x0000000000000000000000000000000000000000000000000000000000000007', // owner
              ],
              data: '0x',
            },
          ],
        };
      },
    } as any;

    const result = await bootstrapTrust({
      domain: 'example.com',
      chainId: 84532,
      registryAddress: REGISTRY_ADDRESS,
      publicClient,
      walletClient: mockWalletClient,
      registerIfMissing: true,
    });

    expect(result.didRegister).toBe(true);
    expect(registeredTokenURI).toBe(
      'https://example.com/.well-known/agent-metadata.json'
    );
    expect(result.transactionHash).toBe('0xtxhash');
    expect(result.record?.agentId).toBe(7n);
    expect(result.trust).toBeDefined();
  });

  it('uses onMissing callback when provided', async () => {
    let callbackInvoked = false;
    const record: IdentityRecord = {
      agentId: 7n,
      owner: '0x0000000000000000000000000000000000000007',
      tokenURI: 'https://example.com/.well-known/agent-metadata.json',
    };

    const publicClient: PublicClientLike = {
      async readContract() {
        return true;
      },
    };

    const result = await bootstrapTrust({
      domain: 'example.com',
      chainId: 84532,
      registryAddress: REGISTRY_ADDRESS,
      publicClient,
      onMissing: async () => {
        callbackInvoked = true;
        return record;
      },
    });

    expect(callbackInvoked).toBe(true);
    expect(result.trust?.registrations?.[0].agentAddress).toBe(
      'eip155:84532:0x0000000000000000000000000000000000000007'
    );
  });
});

describe('bootstrapIdentity', () => {
  it('returns bootstrap trust when registry address is provided', async () => {
    const mockWalletClient = {
      account: {
        address: '0x0000000000000000000000000000000000000009' as const,
      },
      async writeContract() {
        return '0xtxhash' as const;
      },
      async signMessage(args: any) {
        return '0xsignature';
      },
    } as WalletClientLike;

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
                '0x0000000000000000000000000000000000000000000000000000000000000009', // agentId = 9
                '0x0000000000000000000000000000000000000000000000000000000000000009', // owner
              ],
              data: '0x',
            },
          ],
        };
      },
    } as any;

    const makeClients = () => ({
      publicClient,
      walletClient: mockWalletClient,
      signer: mockWalletClient,
    });

    const result = await bootstrapIdentity({
      domain: 'example.com',
      registryAddress: REGISTRY_ADDRESS,
      rpcUrl: 'http://localhost:8545',
      makeClients,
      chainId: 84532,
      registerIfMissing: true,
    });

    expect(result.didRegister).toBe(true);
    expect(result.trust).toBeDefined();
    expect(result.record?.agentId).toBe(9n);
  });

  it('returns empty when registry lookup fails', async () => {
    const publicClient: PublicClientLike = {
      async readContract() {
        throw new Error('network error');
      },
    };

    const makeClients = () => ({
      publicClient,
      walletClient: undefined,
      signer: undefined,
    });

    const result = await bootstrapIdentity({
      domain: 'fallback.example',
      registryAddress: REGISTRY_ADDRESS,
      rpcUrl: 'http://localhost:8545',
      makeClients,
      chainId: 84532,
    });

    expect(result.trust).toBeUndefined();
  });
});

describe('toCaip10', () => {
  it('formats addresses correctly', () => {
    expect(
      toCaip10({
        chainId: 84532,
        address: '0x0000000000000000000000000000000000000001',
      })
    ).toBe('eip155:84532:0x0000000000000000000000000000000000000001');
  });
});
