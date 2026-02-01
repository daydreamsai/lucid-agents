import { ZERO_ADDRESS } from '@lucid-agents/wallet';
import { describe, expect, it } from 'bun:test';

import {
  bootstrapIdentity,
  bootstrapTrust,
  buildMetadataURI,
  buildRegistrationURI,
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

describe('buildRegistrationURI', () => {
  it('constructs registration URI from domain', () => {
    expect(buildRegistrationURI('agent.example.com')).toBe(
      'https://agent.example.com/.well-known/agent-registration.json'
    );
  });

  it('handles domains with https protocol', () => {
    expect(buildRegistrationURI('https://agent.example.com')).toBe(
      'https://agent.example.com/.well-known/agent-registration.json'
    );
  });

  it('normalizes domain', () => {
    expect(buildRegistrationURI('  Agent.Example.COM  ')).toBe(
      'https://agent.example.com/.well-known/agent-registration.json'
    );
  });
});

describe('buildMetadataURI', () => {
  it('is an alias for buildRegistrationURI', () => {
    expect(buildMetadataURI('agent.example.com')).toBe(
      'https://agent.example.com/.well-known/agent-registration.json'
    );
  });
});

describe('createIdentityRegistryClient', () => {
  it('gets agent by ID using ownerOf and tokenURI', async () => {
    const calls: Array<{ functionName: string; args: readonly unknown[] }> = [];
    const mockPublicClient = {
      async readContract(args: any) {
        calls.push({ functionName: args.functionName, args: args.args ?? [] });

        if (args.functionName === 'ownerOf') {
          return '0xAaAA000000000000000000000000000000000001';
        }
        if (args.functionName === 'tokenURI') {
          return 'https://agent.example.com/.well-known/agent-registration.json';
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
    expect(record?.agentURI).toBe(
      'https://agent.example.com/.well-known/agent-registration.json'
    );

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
        if (args.functionName === 'ownerOf') {
          throw new Error('ERC721NonexistentToken');
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

  it('registers agent with agentURI', async () => {
    let writeArgs: any;
    const mockWalletClient = {
      account: {
        address: '0x0000000000000000000000000000000000001234' as const,
        async signMessage({ message }: { message: string | Uint8Array }) {
          return '0xsignature' as const;
        },
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
      agentURI: 'https://agent.example.com/.well-known/agent-registration.json',
    });

    expect(result.transactionHash).toBe('0xtxhash');
    expect(result.agentAddress).toBe(
      '0x0000000000000000000000000000000000001234'
    );
    expect(result.agentId).toBe(42n); // Parsed from event!
    expect(writeArgs.functionName).toBe('register');
    expect(writeArgs.args).toEqual([
      'https://agent.example.com/.well-known/agent-registration.json',
    ]);
  });

  it('registers agent with agentURI and metadata', async () => {
    let writeArgs: any;
    const mockWalletClient = {
      account: {
        address: '0x0000000000000000000000000000000000001234' as const,
        async signMessage({ message }: { message: string | Uint8Array }) {
          return '0xsignature' as const;
        },
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
      agentURI: 'https://agent.example.com/.well-known/agent-registration.json',
      metadata,
    });

    expect(result.transactionHash).toBe('0xtxhash');
    expect(result.agentId).toBe(100n); // Parsed from event!
    expect(writeArgs.functionName).toBe('register');
    expect(writeArgs.args).toEqual([
      'https://agent.example.com/.well-known/agent-registration.json',
      metadata,
    ]);
  });

  it('registers agent with no args', async () => {
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
      async waitForTransactionReceipt() {
        return { logs: [] };
      },
    } as any;

    const client = createIdentityRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient: mockPublicClient,
      walletClient: mockWalletClient,
    });

    await client.register();

    expect(writeArgs.functionName).toBe('register');
    expect(writeArgs.args).toEqual([]);
  });

  it('gets agent wallet by ID', async () => {
    const mockPublicClient = {
      async readContract(args: any) {
        if (args.functionName === 'getAgentWallet') {
          return '0x000000000000000000000000000000000000beef';
        }
        throw new Error(`Unexpected: ${args.functionName}`);
      },
    } as PublicClientLike;

    const client = createIdentityRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient: mockPublicClient,
    });

    const wallet = await client.getAgentWallet(1n);
    expect(wallet).toBe('0x000000000000000000000000000000000000beef');
  });

  it('sets agent wallet with signature', async () => {
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
      async waitForTransactionReceipt() {
        return { logs: [] };
      },
    } as any;

    const client = createIdentityRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient: mockPublicClient,
      walletClient: mockWalletClient,
    });

    await client.setAgentWallet({
      agentId: 1n,
      newWallet: '0x000000000000000000000000000000000000beef',
      deadline: 123n,
      signature: '0x1234',
    });

    expect(writeArgs.functionName).toBe('setAgentWallet');
    expect(writeArgs.args).toEqual([
      1n,
      '0x000000000000000000000000000000000000beef',
      123n,
      '0x1234',
    ]);
  });

  it('unsets agent wallet via helper', async () => {
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
      async waitForTransactionReceipt() {
        return { logs: [] };
      },
    } as any;

    const client = createIdentityRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient: mockPublicClient,
      walletClient: mockWalletClient,
    });

    await client.unsetAgentWallet({
      agentId: 1n,
      deadline: 123n,
      signature: '0x1234',
    });

    expect(writeArgs.functionName).toBe('setAgentWallet');
    expect(writeArgs.args).toEqual([1n, ZERO_ADDRESS, 123n, '0x1234']);
  });

  it('transfer calls safeTransferFrom with correct args', async () => {
    let writeArgs: any;
    const mockWalletClient = {
      account: {
        address: '0x0000000000000000000000000000000000001234' as const,
        async signMessage({ message }: { message: string | Uint8Array }) {
          return '0xsignature' as const;
        },
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
      async waitForTransactionReceipt() {
        return { logs: [] };
      },
    } as any;

    const client = createIdentityRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient: mockPublicClient,
      walletClient: mockWalletClient,
    });

    const to = '0x0000000000000000000000000000000000005678' as const;
    const agentId = 1n;
    const txHash = await client.transfer(to, agentId);

    expect(txHash).toBe('0xtxhash');
    expect(writeArgs.functionName).toBe('safeTransferFrom');
    expect(writeArgs.args).toEqual([
      '0x0000000000000000000000000000000000001234',
      '0x0000000000000000000000000000000000005678',
      1n,
    ]);
  });

  it('transfer throws when walletClient is missing', async () => {
    const mockPublicClient = {
      async readContract() {
        return true;
      },
    } as PublicClientLike;

    const client = createIdentityRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient: mockPublicClient,
    });

    await expect(
      client.transfer('0x0000000000000000000000000000000000005678', 1n)
    ).rejects.toThrow('Wallet client required for transfer');
  });

  it('transfer throws when walletClient has no account', async () => {
    const mockWalletClient = {
      account: undefined,
      async writeContract() {
        return '0xtxhash' as const;
      },
    } as WalletClientLike;

    const mockPublicClient = {
      async readContract() {
        return true;
      },
      async waitForTransactionReceipt() {
        return { logs: [] };
      },
    } as any;

    const client = createIdentityRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient: mockPublicClient,
      walletClient: mockWalletClient,
    });

    await expect(
      client.transfer('0x0000000000000000000000000000000000005678', 1n)
    ).rejects.toThrow('Wallet account required for transfer');
  });

  it('transfer throws when to is zero address', async () => {
    const mockWalletClient = {
      account: {
        address: '0x0000000000000000000000000000000000001234' as const,
      },
      async writeContract() {
        return '0xtxhash' as const;
      },
    } as WalletClientLike;

    const mockPublicClient = {
      async readContract() {
        return true;
      },
      async waitForTransactionReceipt() {
        return { logs: [] };
      },
    } as any;

    const client = createIdentityRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient: mockPublicClient,
      walletClient: mockWalletClient,
    });

    await expect(client.transfer(ZERO_ADDRESS, 1n)).rejects.toThrow(
      'invalid hex address'
    );
  });

  it('transfer throws when to is non-EVM (invalid hex)', async () => {
    const mockWalletClient = {
      account: {
        address: '0x0000000000000000000000000000000000001234' as const,
      },
      async writeContract() {
        return '0xtxhash' as const;
      },
    } as WalletClientLike;

    const mockPublicClient = {
      async readContract() {
        return true;
      },
    } as any;

    const client = createIdentityRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient: mockPublicClient,
      walletClient: mockWalletClient,
    });

    await expect(
      client.transfer('not-a-hex-address' as any, 1n)
    ).rejects.toThrow('invalid hex address');
  });

  it('transferFrom calls transferFrom with correct args', async () => {
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
      async waitForTransactionReceipt() {
        return { logs: [] };
      },
    } as any;

    const client = createIdentityRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient: mockPublicClient,
      walletClient: mockWalletClient,
    });

    const from = '0x0000000000000000000000000000000000001234' as const;
    const to = '0x0000000000000000000000000000000000005678' as const;
    const agentId = 1n;
    const txHash = await client.transferFrom(from, to, agentId);

    expect(txHash).toBe('0xtxhash');
    expect(writeArgs.functionName).toBe('transferFrom');
    expect(writeArgs.args).toEqual([from, to, agentId]);
  });

  it('approve calls approve with correct args', async () => {
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
      async waitForTransactionReceipt() {
        return { logs: [] };
      },
    } as any;

    const client = createIdentityRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient: mockPublicClient,
      walletClient: mockWalletClient,
    });

    const to = '0x0000000000000000000000000000000000005678' as const;
    const agentId = 1n;
    const txHash = await client.approve(to, agentId);

    expect(txHash).toBe('0xtxhash');
    expect(writeArgs.functionName).toBe('approve');
    expect(writeArgs.args).toEqual([to, agentId]);
  });

  it('setApprovalForAll calls setApprovalForAll with correct args', async () => {
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
      async waitForTransactionReceipt() {
        return { logs: [] };
      },
    } as any;

    const client = createIdentityRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient: mockPublicClient,
      walletClient: mockWalletClient,
    });

    const operator = '0x0000000000000000000000000000000000005678' as const;
    const txHash = await client.setApprovalForAll(operator, true);

    expect(txHash).toBe('0xtxhash');
    expect(writeArgs.functionName).toBe('setApprovalForAll');
    expect(writeArgs.args).toEqual([operator, true]);
  });

  it('getApproved returns approved address (no wallet required)', async () => {
    const mockPublicClient = {
      async readContract(args: any) {
        if (args.functionName === 'getApproved') {
          return '0x0000000000000000000000000000000000005678';
        }
        throw new Error(`Unexpected: ${args.functionName}`);
      },
    } as PublicClientLike;

    const client = createIdentityRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient: mockPublicClient,
    });

    const approved = await client.getApproved(1n);
    expect(approved).toBe('0x0000000000000000000000000000000000005678');
  });
});

describe('buildTrustConfigFromIdentity', () => {
  it('builds CAIP-10 registration entries', () => {
    const trust = buildTrustConfigFromIdentity(
      {
        agentId: 5n,
        owner: '0x0000000000000000000000000000000000000005',
        agentURI: 'https://agent.example.com/.well-known/agent-registration.json',
      },
      { chainId: 84532, registryAddress: REGISTRY_ADDRESS }
    );
    expect(trust.registrations?.[0]).toEqual({
      agentId: '5',
      agentAddress: 'eip155:84532:0x0000000000000000000000000000000000000005',
      agentRegistry: 'eip155:84532:0x000000000000000000000000000000000000dead',
    });
  });

  it('preserves large agent identifiers as strings', () => {
    const largeId = (1n << 100n) - 1n;
    const trust = buildTrustConfigFromIdentity(
      {
        agentId: largeId,
        owner: '0x0000000000000000000000000000000000000abc',
        agentURI: 'https://agent.example.com/.well-known/agent-registration.json',
      },
      { chainId: 84532, registryAddress: REGISTRY_ADDRESS }
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
    let registeredAgentURI: string | undefined;

    const mockWalletClient = {
      account: {
        address: '0x0000000000000000000000000000000000000007' as const,
        async signMessage({ message }: { message: string | Uint8Array }) {
          return '0xsignature' as const;
        },
      },
      async writeContract(args: any) {
        registeredAgentURI = args.args[0];
        return '0xtxhash' as const;
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
    expect(registeredAgentURI).toBe(
      'https://example.com/.well-known/agent-registration.json'
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
      agentURI: 'https://example.com/.well-known/agent-registration.json',
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
    const registration = result.trust?.registrations?.[0];
    expect(registration?.agentAddress).toBe(
      'eip155:84532:0x0000000000000000000000000000000000000007'
    );
    expect(registration?.agentRegistry).toBe(
      'eip155:84532:0x000000000000000000000000000000000000dead'
    );
  });
});

describe('bootstrapIdentity', () => {
  it('returns bootstrap trust when registry address is provided', async () => {
    const mockWalletClient = {
      account: {
        address: '0x0000000000000000000000000000000000000009' as const,
        async signMessage({ message }: { message: string | Uint8Array }) {
          return '0xsignature' as const;
        },
      },
      async writeContract() {
        return '0xtxhash' as const;
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

    const result = await bootstrapIdentity({
      domain: 'example.com',
      registryAddress: REGISTRY_ADDRESS,
      rpcUrl: 'http://localhost:8545',
      makeClients: () => ({
        publicClient,
        walletClient: mockWalletClient,
        signer: mockWalletClient,
      }),
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

    const result = await bootstrapIdentity({
      domain: 'fallback.example',
      registryAddress: REGISTRY_ADDRESS,
      rpcUrl: 'http://localhost:8545',
      makeClients: () => ({
        publicClient,
        walletClient: undefined,
        signer: undefined,
      }),
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
