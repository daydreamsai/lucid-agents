import { describe, expect, it } from 'bun:test';

import {
  type AgentIdentity,
  createAgentIdentity,
  getTrustConfig,
  registerAgent,
} from '../init';
import type { PublicClientLike } from '../registries/identity';

const REGISTRY_ADDRESS = '0x000000000000000000000000000000000000dEaD' as const;

// Registered event signature: keccak256("Registered(uint256,string,address)")
const REGISTERED_EVENT_SIG =
  '0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a' as const;

describe('createAgentIdentity', () => {
  it('registers and returns trust config when autoRegister is true', async () => {
    const mockWalletClient = {
      account: {
        address: '0x0000000000000000000000000000000000000007' as const,
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
                '0x0000000000000000000000000000000000000000000000000000000000000007', // agentId = 7
                '0x0000000000000000000000000000000000000000000000000000000000000007', // owner
              ],
              data: '0x',
            },
          ],
        };
      },
    } as any;

    // Provide clients via makeClients factory to bypass viem imports
    const makeClients = () => ({
      publicClient,
      walletClient: mockWalletClient,
      signer: mockWalletClient,
    });

    const result = await createAgentIdentity({
      domain: 'example.com',
      registryAddress: REGISTRY_ADDRESS,
      chainId: 84532,
      rpcUrl: 'http://localhost:8545',
      makeClients,
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

    const result = await createAgentIdentity({
      domain: 'fallback.example',
      registryAddress: REGISTRY_ADDRESS,
      rpcUrl: 'http://localhost:8545',
      makeClients,
      chainId: 84532,
      env: {},
    });

    expect(result.trust).toBeUndefined();
    expect(result.status).toContain('without on-chain identity');
  });

  it('sets isNewRegistration when registering', async () => {
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
                '0x0000000000000000000000000000000000000000000000000000000000000009', // agentId = 9
                '0x0000000000000000000000000000000000000000000000000000000000000009', // owner
              ],
              data: '0x',
            },
          ],
        };
      },
    } as any;

    const walletClient = {
      account: {
        address: '0x0000000000000000000000000000000000000009' as const,
      },
      async writeContract() {
        registerCalled = true;
        return '0x1234567890abcdef' as `0x${string}`;
      },
      async signMessage(args: any) {
        return '0xsignature';
      },
    };

    const makeClients = () => ({
      publicClient,
      walletClient,
      signer: walletClient,
    });

    const result = await createAgentIdentity({
      domain: 'new-agent.example.com',
      registryAddress: REGISTRY_ADDRESS,
      chainId: 84532,
      rpcUrl: 'http://localhost:8545',
      makeClients,
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

    const makeClients = () => ({
      publicClient,
      walletClient: mockWalletClient,
      signer: mockWalletClient,
    });

    const result = await createAgentIdentity({
      chainId: 84532,
      registryAddress: REGISTRY_ADDRESS,
      rpcUrl: 'http://localhost:8545',
      makeClients,
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

    const makeClients = () => ({
      publicClient,
      walletClient: mockWalletClient,
      signer: mockWalletClient,
    });

    const result = await createAgentIdentity({
      domain: 'custom.example.com',
      registryAddress: REGISTRY_ADDRESS,
      chainId: 84532,
      rpcUrl: 'http://localhost:8545',
      makeClients,
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

    const makeClients = () => ({
      publicClient,
      walletClient: mockWalletClient,
      signer: mockWalletClient,
    });

    const result = await createAgentIdentity({
      domain: 'override.example.com',
      registryAddress: REGISTRY_ADDRESS,
      chainId: 84532,
      rpcUrl: 'http://localhost:8545',
      makeClients,
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

    const walletClient = {
      account: {
        address: '0x000000000000000000000000000000000000000d' as const,
      },
      async writeContract() {
        registerCalled = true;
        return '0xabcdef' as `0x${string}`;
      },
      async signMessage(args: any) {
        return '0xsignature';
      },
    };

    const makeClients = () => ({
      publicClient,
      walletClient,
      signer: walletClient,
    });

    const result = await registerAgent({
      domain: 'register.example.com',
      registryAddress: REGISTRY_ADDRESS,
      chainId: 84532,
      rpcUrl: 'http://localhost:8545',
      makeClients,
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
