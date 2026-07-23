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
  type IdentityRegistrationFetch,
  makeViemClientsFromEnv,
  makeViemClientsFromWallet,
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

  it('uses the configured origin rather than appending to a path', () => {
    expect(
      buildRegistrationURI('https://Agent.Example.COM/some/path?ignored=true')
    ).toBe('https://agent.example.com/.well-known/agent-registration.json');
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

  it('rejects lossy or out-of-range agent IDs before an RPC read', async () => {
    let reads = 0;
    const client = createIdentityRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient: {
        async readContract() {
          reads += 1;
          throw new Error('must not read an invalid ID');
        },
      },
    });

    await expect(client.get(Number.MAX_SAFE_INTEGER + 1)).rejects.toThrow(
      /safe integer/i
    );
    await expect(client.get(1n << 256n)).rejects.toThrow(/256-bit integer/i);
    expect(reads).toBe(0);
  });

  it('registers agent with agentURI', async () => {
    let writeArgs: any;
    const mockWalletClient = {
      account: {
        address: '0x0000000000000000000000000000000000001234' as const,
        async signMessage({
          message: _message,
        }: {
          message: string | Uint8Array;
        }) {
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
      async waitForTransactionReceipt({ hash: _hash }: { hash: string }) {
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
        async signMessage({
          message: _message,
        }: {
          message: string | Uint8Array;
        }) {
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
      async waitForTransactionReceipt({ hash: _hash }: { hash: string }) {
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

  it('unsets agent wallet via direct contract call', async () => {
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

    await client.unsetAgentWallet(1n);

    expect(writeArgs.functionName).toBe('unsetAgentWallet');
    expect(writeArgs.args).toEqual([1n]);
  });

  it('isAuthorizedOrOwner checks spender authorization', async () => {
    const mockPublicClient = {
      async readContract({ functionName, args }: any) {
        if (functionName === 'isAuthorizedOrOwner') {
          // Return true if spender is the owner address
          return (
            args[0].toLowerCase() ===
            '0x000000000000000000000000000000000000beef'
          );
        }
        return false;
      },
    } as PublicClientLike;

    const client = createIdentityRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient: mockPublicClient,
    });

    const isAuthorized = await client.isAuthorizedOrOwner(
      '0x000000000000000000000000000000000000beef',
      1n
    );

    expect(isAuthorized).toBe(true);
  });

  it('transfer calls safeTransferFrom with correct args', async () => {
    let writeArgs: any;
    const mockWalletClient = {
      account: {
        address: '0x0000000000000000000000000000000000001234' as const,
        async signMessage({
          message: _message,
        }: {
          message: string | Uint8Array;
        }) {
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

  it('reads metadata and writes registry metadata and URIs', async () => {
    const writes: any[] = [];
    const publicClient = {
      async readContract({ functionName, args }: any) {
        if (functionName === 'getMetadata') {
          if (args[1] === 'missing') return '0x';
          if (args[1] === 'failed') throw new Error('read failed');
          return '0x0102ff';
        }
        if (functionName === 'getVersion') return '1.0.0';
        throw new Error(`Unexpected read: ${functionName}`);
      },
      async waitForTransactionReceipt() {
        return { logs: [] };
      },
    } as any;
    const walletClient = {
      account: {
        address: '0x0000000000000000000000000000000000001234' as const,
      },
      async writeContract(args: any) {
        writes.push(args);
        return '0xtxhash' as const;
      },
    } as WalletClientLike;
    const client = createIdentityRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      namespace: 'eip155',
      publicClient,
      walletClient,
    });

    expect(await client.getMetadata(7n, 'bytes')).toEqual(
      new Uint8Array([1, 2, 255])
    );
    expect(await client.getMetadata(7n, 'missing')).toBeNull();
    expect(await client.getMetadata(7n, 'failed')).toBeNull();
    expect(await client.getVersion()).toBe('1.0.0');
    expect(
      await client.setMetadata(7n, 'profile', new Uint8Array([0, 255]))
    ).toBe('0xtxhash');
    expect(await client.setAgentURI(7n, 'https://agent.example/new.json')).toBe(
      '0xtxhash'
    );
    expect(writes.map(write => [write.functionName, write.args])).toEqual([
      ['setMetadata', [7n, 'profile', '0x00ff']],
      ['setAgentURI', [7n, 'https://agent.example/new.json']],
    ]);
    expect(
      client.toRegistrationEntry(
        {
          agentId: 7n,
          owner: '0x0000000000000000000000000000000000001234',
          agentURI: 'https://agent.example/registration.json',
        },
        '0xsigned'
      )
    ).toEqual({
      agentId: '7',
      agentAddress: 'eip155:84532:0x0000000000000000000000000000000000001234',
      agentRegistry: 'eip155:84532:0x000000000000000000000000000000000000dead',
      agentURI: 'https://agent.example/registration.json',
      signature: '0xsigned',
    });
    await expect(
      client.setMetadata(7n, 'agentWallet', new Uint8Array())
    ).rejects.toThrow('reserved metadata key');
  });

  it('fails write operations clearly when wallet capabilities are unavailable', async () => {
    const publicClient = {
      async readContract() {
        return true;
      },
    } as PublicClientLike;
    const readOnly = createIdentityRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient,
    });

    await expect(readOnly.register()).rejects.toThrow(
      'Wallet client required for register'
    );
    await expect(
      readOnly.setMetadata(1n, 'key', new Uint8Array())
    ).rejects.toThrow('Wallet client required for setMetadata');
    await expect(
      readOnly.setAgentURI(1n, 'https://example.com')
    ).rejects.toThrow('Wallet client required for setAgentURI');
    await expect(
      readOnly.setAgentWallet({
        agentId: 1n,
        newWallet: '0x0000000000000000000000000000000000001234',
        deadline: 1n,
        signature: '0x12',
      })
    ).rejects.toThrow('Wallet client required for setAgentWallet');
    await expect(readOnly.unsetAgentWallet(1n)).rejects.toThrow(
      'Wallet client required for unsetAgentWallet'
    );
    await expect(
      readOnly.transferFrom(
        '0x0000000000000000000000000000000000001234',
        '0x0000000000000000000000000000000000005678',
        1n
      )
    ).rejects.toThrow('Wallet client required for transferFrom');
    await expect(
      readOnly.approve('0x0000000000000000000000000000000000005678', 1n)
    ).rejects.toThrow('Wallet client required for approve');
    await expect(
      readOnly.setApprovalForAll(
        '0x0000000000000000000000000000000000005678',
        true
      )
    ).rejects.toThrow('Wallet client required for setApprovalForAll');
  });

  it('validates registration and ERC-721 write inputs', async () => {
    const publicClient = {
      async readContract() {
        return true;
      },
      async waitForTransactionReceipt() {
        throw new Error('receipt unavailable');
      },
    } as any;
    const accountless = createIdentityRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient,
      walletClient: {
        async writeContract() {
          return '0xtxhash';
        },
      } as WalletClientLike,
    });
    await expect(accountless.register()).rejects.toThrow(
      'wallet account address is required'
    );
    await expect(
      accountless.transferFrom(
        '0x0000000000000000000000000000000000001234',
        '0x0000000000000000000000000000000000005678',
        1n
      )
    ).rejects.toThrow('Wallet account required for transferFrom');
    await expect(
      accountless.approve('0x0000000000000000000000000000000000005678', 1n)
    ).rejects.toThrow('Wallet account required for approve');
    await expect(
      accountless.setApprovalForAll(
        '0x0000000000000000000000000000000000005678',
        true
      )
    ).rejects.toThrow('Wallet account required for setApprovalForAll');

    const walletClient = {
      account: {
        address: '0x0000000000000000000000000000000000001234' as const,
      },
      async writeContract() {
        return '0xtxhash' as const;
      },
    } as WalletClientLike;
    const client = createIdentityRegistryClient({
      address: REGISTRY_ADDRESS,
      chainId: 84532,
      publicClient,
      walletClient,
    });
    await expect(
      client.register({ metadata: [{ key: 'x', value: new Uint8Array() }] })
    ).rejects.toThrow('agentURI is required');
    expect(
      await client.register({ agentURI: 'https://agent.example/registration' })
    ).toEqual({
      transactionHash: '0xtxhash',
      agentAddress: '0x0000000000000000000000000000000000001234',
      agentId: undefined,
    });
    await expect(
      client.transferFrom(
        ZERO_ADDRESS,
        '0x0000000000000000000000000000000000005678',
        1n
      )
    ).rejects.toThrow('from cannot be zero');
    await expect(
      client.transferFrom(
        '0x0000000000000000000000000000000000001234',
        ZERO_ADDRESS,
        1n
      )
    ).rejects.toThrow('to cannot be zero');
    await expect(client.approve(ZERO_ADDRESS, 1n)).rejects.toThrow(
      'approved address cannot be zero'
    );
    await expect(client.setApprovalForAll(ZERO_ADDRESS, true)).rejects.toThrow(
      'operator cannot be zero address'
    );
  });
});

describe('buildTrustConfigFromIdentity', () => {
  it('builds CAIP-10 registration entries', () => {
    const trust = buildTrustConfigFromIdentity(
      {
        agentId: 5n,
        owner: '0x0000000000000000000000000000000000000005',
        agentURI:
          'https://agent.example.com/.well-known/agent-registration.json',
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
        agentURI:
          'https://agent.example.com/.well-known/agent-registration.json',
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
  it('discovers a domain registration document and verifies its agent ID on-chain', async () => {
    const fetches: string[] = [];
    let fetchInit: Parameters<IdentityRegistrationFetch>[1];
    const reads: string[] = [];
    let writes = 0;
    const publicClient: PublicClientLike = {
      async readContract({ functionName }: { functionName: string }) {
        reads.push(functionName);
        if (functionName === 'ownerOf') {
          return '0x0000000000000000000000000000000000000007';
        }
        if (functionName === 'tokenURI') {
          return 'https://example.com/registration.json';
        }
        throw new Error(`Unexpected read: ${functionName}`);
      },
    };
    const walletClient = {
      account: {
        address: '0x0000000000000000000000000000000000000007' as const,
      },
      async writeContract() {
        writes += 1;
        return '0xtxhash' as const;
      },
    } as WalletClientLike;

    const result = await bootstrapTrust({
      domain: 'example.com',
      chainId: 84532,
      registryAddress: REGISTRY_ADDRESS,
      publicClient,
      walletClient,
      registrationDiscovery: {
        fetch: async (input, init) => {
          fetches.push(String(input));
          fetchInit = init;
          return Response.json({
            registrations: [
              {
                agentId: '42',
                agentRegistry:
                  'eip155:84532:0x000000000000000000000000000000000000dead',
              },
            ],
          });
        },
      },
    });

    expect(fetches).toEqual([
      'https://example.com/.well-known/agent-registration.json',
    ]);
    expect(fetchInit?.method).toBe('GET');
    expect(fetchInit?.redirect).toBe('error');
    expect(fetchInit?.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(fetchInit?.headers).get('accept')).toBe(
      'application/json'
    );
    expect(reads).toEqual(['ownerOf', 'tokenURI']);
    expect(writes).toBe(0);
    expect(result.record?.agentId).toBe(42n);
    expect(result.trust?.registrations?.[0].agentId).toBe('42');
  });

  it('fails closed when domain discovery does not match the configured registry', async () => {
    let reads = 0;
    let writes = 0;
    const publicClient: PublicClientLike = {
      async readContract() {
        reads += 1;
        throw new Error('must not read an untrusted ID');
      },
    };
    const walletClient = {
      account: {
        address: '0x0000000000000000000000000000000000000007' as const,
      },
      async writeContract() {
        writes += 1;
        return '0xtxhash' as const;
      },
    } as WalletClientLike;

    await expect(
      bootstrapTrust({
        domain: 'example.com',
        chainId: 84532,
        registryAddress: REGISTRY_ADDRESS,
        publicClient,
        walletClient,
        registrationDiscovery: {
          fetch: async () =>
            Response.json({
              registrations: [
                {
                  agentId: '42',
                  agentRegistry:
                    'eip155:1:0x000000000000000000000000000000000000dead',
                },
                {
                  agentId: '43',
                  agentRegistry:
                    'eip155:84532:0x000000000000000000000000000000000000beef',
                },
              ],
            }),
        },
      })
    ).rejects.toThrow(/matching chain and registry address/i);
    expect(reads).toBe(0);
    expect(writes).toBe(0);
  });

  it('does not trust a discovered ID that is absent from the registry', async () => {
    const reads: string[] = [];
    let writes = 0;
    const publicClient: PublicClientLike = {
      async readContract({ functionName }: { functionName: string }) {
        reads.push(functionName);
        throw new Error('ERC721NonexistentToken');
      },
    };
    const walletClient = {
      account: {
        address: '0x0000000000000000000000000000000000000007' as const,
      },
      async writeContract() {
        writes += 1;
        return '0xtxhash' as const;
      },
    } as WalletClientLike;

    const result = await bootstrapTrust({
      domain: 'example.com',
      chainId: 84532,
      registryAddress: REGISTRY_ADDRESS,
      publicClient,
      walletClient,
      registrationDiscovery: {
        fetch: async () =>
          Response.json({
            registrations: [
              {
                agentId: '42',
                agentRegistry:
                  'eip155:84532:0x000000000000000000000000000000000000dead',
              },
            ],
          }),
      },
    });

    expect(reads).toEqual(['ownerOf']);
    expect(writes).toBe(0);
    expect(result.record).toBeNull();
    expect(result.trust).toBeUndefined();
  });

  it('bounds registration-document size and fetch duration', async () => {
    const baseOptions = {
      domain: 'example.com',
      chainId: 84532,
      registryAddress: REGISTRY_ADDRESS,
      publicClient: {
        async readContract() {
          throw new Error('must not read before trusted discovery');
        },
      } satisfies PublicClientLike,
    };

    await expect(
      bootstrapTrust({
        ...baseOptions,
        registrationDiscovery: {
          maxBytes: 16,
          fetch: async () =>
            new Response('{"registrations":[]}', {
              headers: { 'content-length': '20' },
            }),
        },
      })
    ).rejects.toThrow(/exceeds.*16 bytes/i);

    const streamedBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(17)));
        controller.close();
      },
    });
    await expect(
      bootstrapTrust({
        ...baseOptions,
        registrationDiscovery: {
          maxBytes: 16,
          fetch: async () => new Response(streamedBody),
        },
      })
    ).rejects.toThrow(/exceeds.*16 bytes/i);

    await expect(
      bootstrapTrust({
        ...baseOptions,
        registrationDiscovery: {
          timeoutMs: 10,
          fetch: async () => new Promise<Response>(() => {}),
        },
      })
    ).rejects.toThrow(/timed out/i);

    await expect(
      bootstrapTrust({
        ...baseOptions,
        registrationDiscovery: {
          timeoutMs: 1_501,
          fetch: async () => {
            throw new Error('must reject unsafe bounds before fetching');
          },
        },
      })
    ).rejects.toThrow(/timeoutMs cannot exceed 1500/i);

    await expect(
      bootstrapTrust({
        ...baseOptions,
        registrationDiscovery: {
          maxBytes: 65_537,
          fetch: async () => {
            throw new Error('must reject unsafe bounds before fetching');
          },
        },
      })
    ).rejects.toThrow(/maxBytes cannot exceed 65536/i);

    const stalledBody = new ReadableStream<Uint8Array>({
      pull: async () => new Promise<void>(() => {}),
    });
    await expect(
      bootstrapTrust({
        ...baseOptions,
        registrationDiscovery: {
          timeoutMs: 10,
          fetch: async () => new Response(stalledBody),
        },
      })
    ).rejects.toThrow(/timed out/i);
  });

  it('fails closed for malformed or ambiguous registration documents', async () => {
    let reads = 0;
    let writes = 0;
    const publicClient: PublicClientLike = {
      async readContract() {
        reads += 1;
        throw new Error('must not read an untrusted ID');
      },
    };
    const walletClient = {
      account: {
        address: '0x0000000000000000000000000000000000000007' as const,
      },
      async writeContract() {
        writes += 1;
        return '0xtxhash' as const;
      },
    } as WalletClientLike;
    const options = {
      domain: 'example.com',
      chainId: 84532,
      registryAddress: REGISTRY_ADDRESS,
      publicClient,
      walletClient,
    };

    await expect(
      bootstrapTrust({
        ...options,
        registrationDiscovery: {
          fetch: async () => new Response('{not-json'),
        },
      })
    ).rejects.toThrow(/not valid JSON/i);

    await expect(
      bootstrapTrust({
        ...options,
        registrationDiscovery: {
          fetch: async () => Response.json({}),
        },
      })
    ).rejects.toThrow(/registrations array/i);

    const redirectedResponse = Response.json({
      registrations: [
        {
          agentId: '42',
          agentRegistry:
            'eip155:84532:0x000000000000000000000000000000000000dead',
        },
      ],
    });
    Object.defineProperty(redirectedResponse, 'redirected', { value: true });
    await expect(
      bootstrapTrust({
        ...options,
        registrationDiscovery: {
          fetch: async () => redirectedResponse,
        },
      })
    ).rejects.toThrow(/redirects are not allowed/i);

    await expect(
      bootstrapTrust({
        ...options,
        registrationDiscovery: {
          fetch: async () =>
            Response.json({
              registrations: [
                {
                  agentId: Number.MAX_SAFE_INTEGER + 1,
                  agentRegistry:
                    'eip155:84532:0x000000000000000000000000000000000000dead',
                },
              ],
            }),
        },
      })
    ).rejects.toThrow(/safe integer/i);

    await expect(
      bootstrapTrust({
        ...options,
        registrationDiscovery: {
          fetch: async () =>
            Response.json({
              registrations: [
                {
                  agentId: '42',
                  agentRegistry:
                    'eip155:84532:0x000000000000000000000000000000000000dead',
                },
                {
                  agentId: '43',
                  agentRegistry:
                    'eip155:84532:0x000000000000000000000000000000000000dead',
                },
              ],
            }),
        },
      })
    ).rejects.toThrow(/multiple agent IDs/i);

    expect(reads).toBe(0);
    expect(writes).toBe(0);
  });

  it('reads an explicit agent ID and builds unsigned trust without writing', async () => {
    const reads: string[] = [];
    let writes = 0;
    const publicClient: PublicClientLike = {
      async readContract({ functionName }: { functionName: string }) {
        reads.push(functionName);
        if (functionName === 'ownerOf') {
          return '0x0000000000000000000000000000000000000007';
        }
        if (functionName === 'tokenURI') {
          return 'https://example.com/custom-registration.json';
        }
        throw new Error(`Unexpected read: ${functionName}`);
      },
    };
    const walletClient = {
      account: {
        address: '0x0000000000000000000000000000000000000007' as const,
      },
      async writeContract() {
        writes += 1;
        return '0xtxhash' as const;
      },
    } as WalletClientLike;

    const result = await bootstrapTrust({
      agentId: '42',
      domain: 'example.com',
      chainId: 84532,
      registryAddress: REGISTRY_ADDRESS,
      publicClient,
      walletClient,
    });

    expect(reads).toEqual(['ownerOf', 'tokenURI']);
    expect(writes).toBe(0);
    expect(result.record).toEqual({
      agentId: 42n,
      owner: '0x0000000000000000000000000000000000000007',
      agentURI: 'https://example.com/custom-registration.json',
    });
    expect(result.signature).toBeUndefined();
    expect(result.trust?.registrations?.[0]).toMatchObject({
      agentId: '42',
      agentRegistry: 'eip155:84532:0x000000000000000000000000000000000000dead',
    });
    expect(result.trust?.registrations?.[0].signature).toBeUndefined();
  });

  it('rejects an explicit record whose HTTP origin does not match the domain', async () => {
    let writes = 0;
    const publicClient: PublicClientLike = {
      async readContract({ functionName }: { functionName: string }) {
        if (functionName === 'ownerOf') {
          return '0x0000000000000000000000000000000000000007';
        }
        if (functionName === 'tokenURI') {
          return 'https://different.example/registration.json';
        }
        throw new Error(`Unexpected read: ${functionName}`);
      },
    };
    const walletClient = {
      account: {
        address: '0x0000000000000000000000000000000000000007' as const,
      },
      async writeContract() {
        writes += 1;
        return '0xtxhash' as const;
      },
    } as WalletClientLike;

    await expect(
      bootstrapTrust({
        agentId: 42n,
        domain: 'example.com',
        chainId: 84532,
        registryAddress: REGISTRY_ADDRESS,
        publicClient,
        walletClient,
      })
    ).rejects.toThrow(/does not match configured domain/i);
    expect(writes).toBe(0);
  });

  it.each([
    'ipfs://bafy-existing-registration',
    'not a valid registration URI',
  ])(
    'rejects an uncomparable on-chain agent URI unless it is explicitly pinned: %s',
    async agentURI => {
      const publicClient: PublicClientLike = {
        async readContract({ functionName }: { functionName: string }) {
          if (functionName === 'ownerOf') {
            return '0x0000000000000000000000000000000000000007';
          }
          if (functionName === 'tokenURI') {
            return agentURI;
          }
          throw new Error(`Unexpected read: ${functionName}`);
        },
      };

      await expect(
        bootstrapTrust({
          agentId: 42n,
          domain: 'example.com',
          chainId: 84532,
          registryAddress: REGISTRY_ADDRESS,
          publicClient,
        })
      ).rejects.toThrow(/cannot verify.*configured domain/i);
    }
  );

  it('accepts a non-HTTP agent URI only when the caller pins it exactly', async () => {
    const agentURI = 'ipfs://bafy-existing-registration';
    const publicClient: PublicClientLike = {
      async readContract({ functionName }: { functionName: string }) {
        if (functionName === 'ownerOf') {
          return '0x0000000000000000000000000000000000000007';
        }
        if (functionName === 'tokenURI') {
          return agentURI;
        }
        throw new Error(`Unexpected read: ${functionName}`);
      },
    };

    const result = await bootstrapTrust({
      agentId: 42n,
      agentURI,
      domain: 'example.com',
      chainId: 84532,
      registryAddress: REGISTRY_ADDRESS,
      publicClient,
    });

    expect(result.record?.agentURI).toBe(agentURI);
    expect(result.trust?.registrations?.[0].agentId).toBe('42');
  });

  it('never registers a replacement when an explicit agent ID is missing', async () => {
    let reads = 0;
    let writes = 0;
    let missingFallbacks = 0;
    const publicClient: PublicClientLike = {
      async readContract() {
        reads += 1;
        throw new Error('ERC721NonexistentToken');
      },
    };
    const walletClient = {
      account: {
        address: '0x0000000000000000000000000000000000000007' as const,
      },
      async writeContract() {
        writes += 1;
        return '0xtxhash' as const;
      },
    } as WalletClientLike;

    await expect(
      bootstrapTrust({
        agentId: 42n,
        domain: 'example.com',
        chainId: 84532,
        registryAddress: REGISTRY_ADDRESS,
        publicClient,
        walletClient,
        registerIfMissing: true,
        onMissing: () => {
          missingFallbacks += 1;
          return {
            agentId: 43n,
            owner: '0x0000000000000000000000000000000000000007' as const,
            agentURI: 'https://example.com/registration.json',
          };
        },
      })
    ).rejects.toThrow(/remove agentId to register a new identity/i);
    expect(reads).toBe(1);
    expect(missingFallbacks).toBe(0);
    expect(writes).toBe(0);
  });

  it('registers agent when registerIfMissing is true', async () => {
    let registeredAgentURI: string | undefined;

    const mockWalletClient = {
      account: {
        address: '0x0000000000000000000000000000000000000007' as const,
        async signMessage({
          message: _message,
        }: {
          message: string | Uint8Array;
        }) {
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
      async waitForTransactionReceipt({ hash: _hash }: { hash: string }) {
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
        async signMessage({
          message: _message,
        }: {
          message: string | Uint8Array;
        }) {
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
      async waitForTransactionReceipt({ hash: _hash }: { hash: string }) {
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
      agentId: 42n,
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

  it('honors skipRegister as a read-only override', async () => {
    let writes = 0;
    const result = await bootstrapIdentity({
      agentId: 42n,
      domain: 'fallback.example',
      registryAddress: REGISTRY_ADDRESS,
      publicClient: {
        async readContract() {
          throw new Error('ERC721NonexistentToken');
        },
      },
      walletClient: {
        account: {
          address: '0x0000000000000000000000000000000000000007' as const,
        },
        async writeContract() {
          writes += 1;
          return '0xtxhash' as const;
        },
      },
      chainId: 84532,
      registerIfMissing: true,
      skipRegister: true,
      logger: { info() {}, warn() {} },
    });

    expect(writes).toBe(0);
    expect(result.record).toBeUndefined();
    expect(result.trust).toBeUndefined();
  });
});

describe('viem client factories', () => {
  it('uses a connector-provided wallet client and requires an RPC URL', async () => {
    const providedWalletClient = {
      account: {
        address: '0x0000000000000000000000000000000000001234',
      },
    };
    const factory = await makeViemClientsFromWallet({
      env: {},
      walletHandle: {
        kind: 'local',
        connector: {
          async getWalletClient() {
            return providedWalletClient;
          },
        },
      } as any,
    });
    expect(factory).toBeDefined();
    if (!factory) throw new Error('expected viem wallet factory');

    expect(await factory({ chainId: 84532, rpcUrl: '', env: {} })).toBeNull();
    const clients = await factory({
      chainId: 84532,
      rpcUrl: 'http://localhost:8545',
      env: {},
    });
    expect(clients?.walletClient).toBe(providedWalletClient as any);
    expect(clients?.signer).toBe(providedWalletClient as any);
    expect((clients?.publicClient as any).chain.id).toBe(84532);
  });

  it('adapts local signer methods into a viem account', async () => {
    const calls: Array<[string, unknown]> = [];
    const factory = await makeViemClientsFromWallet({
      rpcUrl: 'http://localhost:8545',
      env: {},
      walletHandle: {
        kind: 'local',
        connector: {
          signer: {
            async signMessage(message: unknown) {
              calls.push(['message', message]);
              return '0xmessage';
            },
            async signTypedData(payload: unknown) {
              calls.push(['typed', payload]);
              return '0xtyped';
            },
            async signTransaction(transaction: unknown) {
              calls.push(['transaction', transaction]);
              return '0xtransaction';
            },
          },
          async getWalletClient() {
            throw new Error('connector client unavailable');
          },
          async getWalletMetadata() {
            return {
              address: '0x0000000000000000000000000000000000001234',
            };
          },
          async signChallenge() {
            throw new Error('challenge fallback should not be used');
          },
        },
      } as any,
    });
    if (!factory) throw new Error('expected viem wallet factory');

    const clients = await factory({ chainId: 999999, rpcUrl: '', env: {} });
    const account = (clients?.walletClient as any)?.account;
    expect(await account.signMessage({ message: 'hello' })).toBe('0xmessage');
    expect(
      await account.signTypedData({
        domain: { name: 'Agent' },
        types: { Agent: [{ name: 'id', type: 'uint256' }] },
        message: { id: 1n },
        primaryType: 'Agent',
      })
    ).toBe('0xtyped');
    expect(await account.signTransaction({ to: REGISTRY_ADDRESS })).toBe(
      '0xtransaction'
    );
    expect(calls.map(([kind]) => kind)).toEqual([
      'message',
      'typed',
      'transaction',
    ]);
  });

  it('falls back to connector challenges for local signing', async () => {
    const challenges: any[] = [];
    const factory = await makeViemClientsFromWallet({
      env: { RPC_URL: 'http://localhost:8545' },
      walletHandle: {
        kind: 'local',
        connector: {
          signer: {},
          async getWalletMetadata() {
            return {
              address: '0x0000000000000000000000000000000000005678',
            };
          },
          async signChallenge(challenge: unknown) {
            challenges.push(challenge);
            return '0xchallenge';
          },
        },
      } as any,
    });
    if (!factory) throw new Error('expected viem wallet factory');

    const clients = await factory({
      chainId: 84532,
      rpcUrl: undefined as any,
      env: {},
    });
    const account = (clients?.walletClient as any)?.account;
    expect(
      await account.signMessage({ message: new Uint8Array([1, 2, 255]) })
    ).toBe('0xchallenge');
    expect(await account.signMessage({ message: 'plain text' })).toBe(
      '0xchallenge'
    );
    expect(
      await account.signTypedData({
        domain: { name: 'Agent' },
        types: {},
        message: { id: 1 },
        primaryType: 'Agent',
      })
    ).toBe('0xchallenge');
    await expect(account.signTransaction({})).rejects.toThrow(
      'require transaction signing support'
    );
    expect(challenges[0].payload).toBe('0x0102ff');
    expect(challenges[1].payload).toBe('plain text');
    expect(challenges[2].payload.typedData.primaryType).toBe('Agent');
  });

  it('creates public-only viem clients from environment configuration', async () => {
    const factory = await makeViemClientsFromEnv({ env: {} });
    expect(factory).toBeDefined();
    if (!factory) throw new Error('expected viem environment factory');

    expect(await factory({ chainId: 84532, rpcUrl: '', env: {} })).toBeNull();
    const knownChain = await factory({
      chainId: 84532,
      rpcUrl: 'http://localhost:8545',
      env: {},
    });
    const customChain = await factory({
      chainId: 999999,
      rpcUrl: 'http://localhost:8545',
      env: {},
    });
    expect((knownChain?.publicClient as any).chain.id).toBe(84532);
    expect((customChain?.publicClient as any).chain.id).toBe(999999);
    expect(knownChain?.walletClient).toBeUndefined();
    expect(knownChain?.signer).toBeUndefined();
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
