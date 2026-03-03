import { SolanaSDK } from '8004-solana';
import { describe, expect, it, mock } from 'bun:test';

import { createSolanaIdentityRegistryClient } from '../registries/identity';

/** Typed shape for the subset of SolanaSDK methods used by the identity registry client */
type MockSolanaSDK = {
  getAgentByAgentId: ReturnType<typeof mock>;
  getAgentByWallet: ReturnType<typeof mock>;
  registerAgent: ReturnType<typeof mock>;
  getCluster: ReturnType<typeof mock>;
};

/** Build a mock SolanaSDK matching the methods actually used in the registry client */
function makeMockSdk(overrides: Partial<MockSolanaSDK> = {}): MockSolanaSDK {
  return {
    // getAgentByAgentId is used for getAgent(agentId)
    getAgentByAgentId: mock(async () => null),
    // getAgentByWallet is used for getAgentByOwner(walletAddress)
    getAgentByWallet: mock(async () => null),
    // registerAgent is used for on-chain registration
    registerAgent: mock(async () => ({ agentId: '42', signature: 'sig123' })),
    getCluster: mock(() => 'devnet'),
    ...overrides,
  };
}

/**
 * Typed factory: wraps the single unavoidable cast in one place so individual
 * tests never need `as any`.
 */
function createClientFromMock(sdk: MockSolanaSDK) {
  return createSolanaIdentityRegistryClient(
    sdk as unknown as InstanceType<typeof SolanaSDK>
  );
}

const INDEXED_AGENT = {
  agent_id: 5,
  owner: 'OwnerAddress111111111111111111111111111111',
  agent_uri: 'https://agent.example.com/.well-known/agent.json',
  asset: 'AssetAddress11111111111111111111111111111111',
};

// A valid PreparedTransaction-shaped response for skipSend flows
const FAKE_PREPARED_TX = {
  transaction: Buffer.from('fake-unsigned-tx-bytes').toString('base64'),
  blockhash: 'FakeBlocKHash1111111111111111111111111111111',
  lastValidBlockHeight: 999,
  signer: 'SignerPubkey11111111111111111111111111111111',
};

describe('createSolanaIdentityRegistryClient', () => {
  describe('getAgent', () => {
    it('returns null when agent not found', async () => {
      const sdk = makeMockSdk({ getAgentByAgentId: mock(async () => null) });
      const client = createClientFromMock(sdk);
      const result = await client.getAgent(1n);
      expect(result).toBeNull();
    });

    it('returns agent record when found', async () => {
      const sdk = makeMockSdk({
        getAgentByAgentId: mock(async () => INDEXED_AGENT),
      });
      const client = createClientFromMock(sdk);
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
      const client = createClientFromMock(sdk);
      await expect(client.getAgent(1n)).rejects.toThrow(
        'getAgent: failed to fetch agent'
      );
    });
  });

  describe('getAgentByOwner', () => {
    it('returns null when wallet not found', async () => {
      const sdk = makeMockSdk({ getAgentByWallet: mock(async () => null) });
      const client = createClientFromMock(sdk);
      const result = await client.getAgentByOwner('ABC123');
      expect(result).toBeNull();
    });

    it('returns agent record for wallet owner', async () => {
      const sdk = makeMockSdk({
        getAgentByWallet: mock(async () => INDEXED_AGENT),
      });
      const client = createClientFromMock(sdk);
      const result = await client.getAgentByOwner(INDEXED_AGENT.owner);
      expect(result?.agentId).toBe(5);
      expect(result?.owner).toBe(INDEXED_AGENT.owner);
      expect(result?.uri).toBe(INDEXED_AGENT.agent_uri);
    });

    it('rethrows SDK errors for getAgentByOwner', async () => {
      const sdk = makeMockSdk({
        getAgentByWallet: mock(async () => {
          throw new Error('network error');
        }),
      });
      const client = createClientFromMock(sdk);
      await expect(client.getAgentByOwner('ABC123')).rejects.toThrow(
        'getAgentByOwner: failed to fetch agent'
      );
    });
  });

  describe('registerAgent', () => {
    it('calls sdk.registerAgent with tokenUri', async () => {
      const sdk = makeMockSdk();
      const client = createClientFromMock(sdk);
      const result = await client.registerAgent({
        domain: 'agent.example.com',
        name: 'Test Agent',
      });
      expect(result.didRegister).toBe(true);
      expect(sdk.registerAgent).toHaveBeenCalled();
    });

    it('uses custom agentURI when provided', async () => {
      const sdk = makeMockSdk();
      const client = createClientFromMock(sdk);
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
      const client = createClientFromMock(sdk);
      const result = await client.registerAgent({
        domain: 'agent.example.com',
      });
      expect(result.alreadyExists).toBe(true);
      expect(result.didRegister).toBe(false);
    });

    it('returns non-empty unsignedTransaction when skipSend=true', async () => {
      // Mock must return PreparedTransaction shape ({transaction: base64}) so the
      // registry client can decode it into a real Uint8Array.
      const sdk = makeMockSdk({
        registerAgent: mock(async () => FAKE_PREPARED_TX),
      });
      const client = createClientFromMock(sdk);
      const result = await client.registerAgent({
        domain: 'agent.example.com',
        skipSend: true,
      });
      expect(result.didRegister).toBe(false);
      expect(result.unsignedTransaction).toBeInstanceOf(Uint8Array);
      expect(result.unsignedTransaction?.length).toBeGreaterThan(0);
    });
  });
});
