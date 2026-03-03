import { describe, expect, it, mock } from 'bun:test';

import { createSolanaIdentityRegistryClient } from '../registries/identity';

/** Build a mock SolanaSDK */
function makeMockSdk(overrides: Record<string, unknown> = {}) {
  return {
    getAgent: mock(async () => null),
    getAgentsByOwner: mock(async () => []),
    registerAgent: mock(async () => ({ agentId: BigInt(42), signature: 'sig123' })),
    getCluster: mock(() => 'devnet'),
    ...overrides,
  } as any;
}

describe('createSolanaIdentityRegistryClient', () => {
  describe('getAgent', () => {
    it('returns null when agent not found', async () => {
      const sdk = makeMockSdk({ getAgent: mock(async () => null) });
      const client = createSolanaIdentityRegistryClient(sdk);
      const result = await client.getAgent(1n);
      expect(result).toBeNull();
    });

    it('returns agent record when found', async () => {
      const sdk = makeMockSdk({
        getAgent: mock(async () => ({
          agentId: BigInt(5),
          owner: { toString: () => '0xABC' },
          uri: 'https://agent.example.com',
        })),
      });
      const client = createSolanaIdentityRegistryClient(sdk);
      const result = await client.getAgent(5n);
      expect(result?.agentId).toBeDefined();
      expect(result?.cluster).toBe('devnet');
    });

    it('returns null on SDK error', async () => {
      const sdk = makeMockSdk({
        getAgent: mock(async () => { throw new Error('network error'); }),
      });
      const client = createSolanaIdentityRegistryClient(sdk);
      const result = await client.getAgent(1n);
      expect(result).toBeNull();
    });
  });

  describe('getAgentByOwner', () => {
    it('returns null when no agents for owner', async () => {
      const sdk = makeMockSdk({ getAgentsByOwner: mock(async () => []) });
      const client = createSolanaIdentityRegistryClient(sdk);
      const result = await client.getAgentByOwner('ABC123');
      expect(result).toBeNull();
    });

    it('returns first agent for owner', async () => {
      const sdk = makeMockSdk({
        getAgentsByOwner: mock(async () => [
          { agentId: BigInt(7), owner: { toString: () => 'OWNER' }, uri: 'https://x.com' },
        ]),
      });
      const client = createSolanaIdentityRegistryClient(sdk);
      const result = await client.getAgentByOwner('OWNER');
      expect(result?.agentId).toBeDefined();
    });
  });

  describe('registerAgent', () => {
    it('calls sdk.registerAgent with tokenUri', async () => {
      const sdk = makeMockSdk();
      const client = createSolanaIdentityRegistryClient(sdk);
      const result = await client.registerAgent({
        domain: 'agent.example.com',
        name: 'Test Agent',
      });
      expect(result.didRegister).toBe(true);
      expect(sdk.registerAgent).toHaveBeenCalled();
    });

    it('handles already-exists error gracefully', async () => {
      const sdk = makeMockSdk({
        registerAgent: mock(async () => { throw new Error('agent already exists'); }),
      });
      const client = createSolanaIdentityRegistryClient(sdk);
      const result = await client.registerAgent({ domain: 'agent.example.com' });
      expect(result.alreadyExists).toBe(true);
      expect(result.didRegister).toBe(false);
    });

    it('returns unsignedTransaction when skipSend=true', async () => {
      const sdk = makeMockSdk();
      const client = createSolanaIdentityRegistryClient(sdk);
      const result = await client.registerAgent({
        domain: 'agent.example.com',
        skipSend: true,
      });
      expect(result.didRegister).toBe(false);
      expect(result.unsignedTransaction).toBeInstanceOf(Uint8Array);
    });
  });
});
