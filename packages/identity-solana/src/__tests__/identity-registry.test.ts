import { describe, expect, it, mock } from 'bun:test';

import { createSolanaIdentityRegistryClient } from '../registries/identity';

/** Build a mock SolanaSDK matching the methods actually used in the registry client */
function makeMockSdk(overrides: Record<string, unknown> = {}) {
  return {
    // getAgentByAgentId is used for getAgent(agentId)
    getAgentByAgentId: mock(async () => null),
    // getAgentByWallet is used for getAgentByOwner(walletAddress)
    getAgentByWallet: mock(async () => null),
    // registerAgent is used for on-chain registration
    registerAgent: mock(async () => ({ agentId: '42', signature: 'sig123' })),
    getCluster: mock(() => 'devnet'),
    ...overrides,
  } as any;
}

const INDEXED_AGENT = {
  agent_id: 5,
  owner: 'OwnerAddress111111111111111111111111111111',
  agent_uri: 'https://agent.example.com/.well-known/agent.json',
  asset: 'AssetAddress11111111111111111111111111111111',
};

describe('createSolanaIdentityRegistryClient', () => {
  describe('getAgent', () => {
    it('returns null when agent not found', async () => {
      const sdk = makeMockSdk({ getAgentByAgentId: mock(async () => null) });
      const client = createSolanaIdentityRegistryClient(sdk);
      const result = await client.getAgent(1n);
      expect(result).toBeNull();
    });

    it('returns agent record when found', async () => {
      const sdk = makeMockSdk({
        getAgentByAgentId: mock(async () => INDEXED_AGENT),
      });
      const client = createSolanaIdentityRegistryClient(sdk);
      const result = await client.getAgent(5);
      expect(result?.agentId).toBe(5);
      expect(result?.owner).toBe(INDEXED_AGENT.owner);
      expect(result?.uri).toBe(INDEXED_AGENT.agent_uri);
      expect(result?.cluster).toBe('devnet');
    });

    it('rethrows SDK errors so callers distinguish outages from missing agents', async () => {
      const sdk = makeMockSdk({
        getAgentByAgentId: mock(async () => {
          throw new Error('network error');
        }),
      });
      const client = createSolanaIdentityRegistryClient(sdk);
      await expect(client.getAgent(1n)).rejects.toThrow(
        'getAgent: failed to fetch agent'
      );
    });
  });

  describe('getAgentByOwner', () => {
    it('returns null when wallet not found', async () => {
      const sdk = makeMockSdk({ getAgentByWallet: mock(async () => null) });
      const client = createSolanaIdentityRegistryClient(sdk);
      const result = await client.getAgentByOwner('ABC123');
      expect(result).toBeNull();
    });

    it('returns agent record for wallet owner', async () => {
      const sdk = makeMockSdk({
        getAgentByWallet: mock(async () => INDEXED_AGENT),
      });
      const client = createSolanaIdentityRegistryClient(sdk);
      const result = await client.getAgentByOwner(INDEXED_AGENT.owner);
      expect(result?.agentId).toBe(5);
      expect(result?.owner).toBe(INDEXED_AGENT.owner);
      expect(result?.uri).toBe(INDEXED_AGENT.agent_uri);
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

    it('uses custom agentURI when provided', async () => {
      const sdk = makeMockSdk();
      const client = createSolanaIdentityRegistryClient(sdk);
      await client.registerAgent({
        domain: 'agent.example.com',
        agentURI: 'https://custom.example.com/agent.json',
      });
      expect(sdk.registerAgent).toHaveBeenCalledWith(
        'https://custom.example.com/agent.json'
      );
    });

    it('handles already-exists error gracefully', async () => {
      const sdk = makeMockSdk({
        registerAgent: mock(async () => {
          throw new Error('agent already exists');
        }),
      });
      const client = createSolanaIdentityRegistryClient(sdk);
      const result = await client.registerAgent({
        domain: 'agent.example.com',
      });
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
