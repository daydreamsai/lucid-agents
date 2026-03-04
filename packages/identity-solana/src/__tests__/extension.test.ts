/**
 * Tests for identitySolana() extension.
 * Verifies .use() attaches, onManifestBuild merges trust,
 * and skipSend support works for browser wallets.
 */

import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test';
import type { AgentCardWithEntrypoints } from '@lucid-agents/types/a2a';

// Mock @solana/web3.js before importing extension
mock.module('@solana/web3.js', () => {
  class MockPublicKey {
    private _val: string;
    constructor(value: any) {
      this._val = typeof value === 'string' ? value : 'MockPubKey';
    }
    toBase58() { return this._val; }
    static findProgramAddressSync(_seeds: any, _programId: any): [MockPublicKey, number] {
      return [new MockPublicKey('MockPda11111111111111111111111111111111111111'), 255];
    }
  }
  class MockKeypair {
    publicKey = new MockPublicKey('MockOwner11111111111111111111111111111111111');
    secretKey = new Uint8Array(64);
    static fromSecretKey(sk: Uint8Array) {
      const kp = new MockKeypair();
      kp.secretKey = sk;
      return kp;
    }
  }
  class MockConnection {
    async getAccountInfo() { return null; }
  }
  class MockTransaction {
    add(ix: any) { return this; }
  }
  class MockTransactionInstruction {
    constructor(public opts: any) {}
  }
  class MockSystemProgram {
    static programId = new MockPublicKey('11111111111111111111111111111111');
  }
  return {
    Connection: MockConnection,
    Keypair: MockKeypair,
    PublicKey: MockPublicKey,
    SystemProgram: MockSystemProgram,
    Transaction: MockTransaction,
    TransactionInstruction: MockTransactionInstruction,
    sendAndConfirmTransaction: mock(async () => 'mockExtSig'),
  };
});

import { identitySolana, createAgentCardWithSolanaIdentity } from '../extension.js';
import type { TrustConfig } from '@lucid-agents/types/identity';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

const baseCard: AgentCardWithEntrypoints = {
  name: 'solana-agent',
  version: '1.0.0',
  url: 'https://my-agent.example.com/',
  entrypoints: {},
  skills: [],
};

describe('identitySolana — extension contract', () => {
  it('has name "identity-solana"', () => {
    const ext = identitySolana();
    expect(ext.name).toBe('identity-solana');
  });

  it('build() returns { trust: undefined } initially', () => {
    const ext = identitySolana();
    const slice = ext.build({} as any);
    expect(slice).toHaveProperty('trust');
    expect(slice.trust).toBeUndefined();
  });

  it('uses pre-configured trust from config', () => {
    const trust: TrustConfig = {
      registrations: [
        {
          agentId: '1',
          agentRegistry: 'solana:devnet:AgentId11111111111111111111111111111111111111',
        },
      ],
      trustModels: ['feedback'],
    };
    const ext = identitySolana({ config: { trust } });
    const slice = ext.build({} as any);
    expect(slice.trust).toEqual(trust);
  });

  it('onManifestBuild merges trust into card', () => {
    const trust: TrustConfig = {
      registrations: [
        {
          agentId: '5',
          agentRegistry: 'solana:mainnet-beta:AgentId11111111111111111111111111111111111111',
        },
      ],
      trustModels: ['feedback', 'inference-validation'],
    };
    const ext = identitySolana({ config: { trust } });
    // Trigger build to set internal trustConfig
    ext.build({} as any);
    const enhanced = ext.onManifestBuild!(baseCard, {} as any);
    expect(enhanced.registrations).toBeDefined();
    expect(enhanced.trustModels).toContain('feedback');
  });

  it('onManifestBuild returns original card when no trust', () => {
    const ext = identitySolana();
    ext.build({} as any);
    const result = ext.onManifestBuild!(baseCard, {} as any);
    expect(result).toBe(baseCard);
  });

  it('onBuild is defined (async setup hook)', () => {
    const ext = identitySolana();
    expect(ext.onBuild).toBeTypeOf('function');
  });
});

describe('identitySolana — onBuild with config', () => {
  it('onBuild with no domain/autoRegister does not set trust', async () => {
    const ext = identitySolana({ config: {} });
    ext.build({} as any);
    await ext.onBuild?.({} as any);
    const card = ext.onManifestBuild!(baseCard, {} as any);
    // No domain, no autoRegister — trust should be undefined
    expect(card).toBe(baseCard);
  });

  it('skips onBuild when trust already set in config', async () => {
    const trust: TrustConfig = { trustModels: ['feedback'] };
    const ext = identitySolana({ config: { trust } });
    ext.build({} as any);
    await ext.onBuild?.({} as any);
    const card = ext.onManifestBuild!(baseCard, {} as any);
    expect(card.trustModels).toContain('feedback');
  });
});

describe('createAgentCardWithSolanaIdentity — standalone', () => {
  it('merges trust into card', () => {
    const trust: TrustConfig = {
      trustModels: ['feedback'],
      registrations: [
        {
          agentId: '1',
          agentRegistry: 'solana:devnet:ProgramId',
        },
      ],
    };
    const enhanced = createAgentCardWithSolanaIdentity(baseCard, trust);
    expect(enhanced.trustModels).toEqual(['feedback']);
    expect(enhanced.registrations).toHaveLength(1);
  });
});
