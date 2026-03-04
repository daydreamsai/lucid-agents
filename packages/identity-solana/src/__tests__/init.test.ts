/**
 * Integration tests for createSolanaAgentIdentity.
 *
 * All Solana SDK (Connection / sendAndConfirmTransaction) calls are mocked.
 * Tests verify the public API shape, not on-chain behavior.
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

// ─── Mock @solana/web3.js ────────────────────────────────────────────────────

const mockGetAccountInfo = mock(async (_pubkey: any, _commitment?: any) => null);
const mockSendAndConfirmTransaction = mock(async () => 'mockSignature123');

mock.module('@solana/web3.js', () => {
  class MockPublicKey {
    private _bs58: string;
    constructor(value: any) {
      if (typeof value === 'string') {
        this._bs58 = value;
      } else if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
        // Simple encoding
        this._bs58 = 'MockPubKey' + Array.from(value).slice(0, 4).join('');
      } else {
        this._bs58 = 'MockPublicKey';
      }
    }
    toBase58() { return this._bs58; }
    static findProgramAddressSync(_seeds: any, _programId: any): [MockPublicKey, number] {
      return [new MockPublicKey('MockPda11111111111111111111111111111111111111'), 255];
    }
  }

  class MockKeypair {
    publicKey = new MockPublicKey('MockOwnerAddr11111111111111111111111111111111');
    secretKey = new Uint8Array(64);
    static fromSecretKey(secretKey: Uint8Array) {
      const kp = new MockKeypair();
      kp.secretKey = secretKey;
      return kp;
    }
    static generate() {
      return new MockKeypair();
    }
  }

  class MockConnection {
    async getAccountInfo(pubkey: any, commitment?: any) {
      return mockGetAccountInfo(pubkey, commitment);
    }
  }

  class MockTransaction {
    instructions: any[] = [];
    add(ix: any) { this.instructions.push(ix); return this; }
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
    sendAndConfirmTransaction: mockSendAndConfirmTransaction,
  };
});

// ─── Import under test (after mocks) ────────────────────────────────────────
import {
  createSolanaAgentIdentity,
  registerSolanaAgent,
  getSolanaTrustConfig,
} from '../init.js';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  mockGetAccountInfo.mockReset();
  mockSendAndConfirmTransaction.mockReset();
  // Default: no existing registration
  mockGetAccountInfo.mockImplementation(async () => null);
  mockSendAndConfirmTransaction.mockImplementation(async () => 'mockSignatureFoo');
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function makePrivateKey(): string {
  return JSON.stringify(Array.from({ length: 64 }, (_, i) => i));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createSolanaAgentIdentity — no registration', () => {
  it('returns status with no identity when autoRegister=false and no record', async () => {
    const result = await createSolanaAgentIdentity({
      domain: 'agent.example.com',
      autoRegister: false,
      cluster: 'devnet',
    });
    expect(result.status).toContain('No Solana identity');
    expect(result.didRegister).toBe(false);
    expect(result.trust).toBeUndefined();
  });

  it('includes clients even without identity record', async () => {
    const result = await createSolanaAgentIdentity({
      autoRegister: false,
      cluster: 'devnet',
    });
    expect(result.clients).toBeDefined();
    expect(result.clients?.identity).toBeDefined();
    expect(result.clients?.reputation).toBeDefined();
  });
});

describe('createSolanaAgentIdentity — with registration', () => {
  it('registers a new agent when autoRegister=true', async () => {
    const result = await createSolanaAgentIdentity({
      domain: 'agent.example.com',
      autoRegister: true,
      cluster: 'devnet',
      privateKey: makePrivateKey(),
    });
    expect(result.didRegister).toBe(true);
    expect(result.isNewRegistration).toBe(true);
    expect(result.status).toContain('Successfully registered');
  });

  it('includes transaction signature on successful registration', async () => {
    const result = await createSolanaAgentIdentity({
      domain: 'agent.example.com',
      autoRegister: true,
      cluster: 'devnet',
      privateKey: makePrivateKey(),
    });
    expect(result.transactionSignature).toBe('mockSignatureFoo');
  });

  it('builds trust config after registration', async () => {
    const result = await createSolanaAgentIdentity({
      domain: 'agent.example.com',
      autoRegister: true,
      cluster: 'devnet',
      privateKey: makePrivateKey(),
    });
    expect(result.trust).toBeDefined();
    expect(result.trust?.trustModels).toContain('feedback');
    expect(result.trust?.registrations).toHaveLength(1);
  });

  it('trust registrations use Solana CAIP-10 format', async () => {
    const result = await createSolanaAgentIdentity({
      domain: 'agent.example.com',
      autoRegister: true,
      cluster: 'devnet',
      privateKey: makePrivateKey(),
    });
    const reg = result.trust?.registrations?.[0];
    expect(reg?.agentRegistry).toMatch(/^solana:devnet:/);
  });

  it('resolves domain from env when not provided', async () => {
    process.env.AGENT_DOMAIN = 'env-agent.example.com';
    process.env.SOLANA_PRIVATE_KEY = makePrivateKey();
    const result = await createSolanaAgentIdentity({
      autoRegister: true,
      cluster: 'devnet',
    });
    expect(result.domain).toBe('env-agent.example.com');
  });
});

describe('createSolanaAgentIdentity — skipSend', () => {
  it('returns null signature when skipSend=true', async () => {
    const result = await createSolanaAgentIdentity({
      domain: 'agent.example.com',
      autoRegister: true,
      cluster: 'devnet',
      privateKey: makePrivateKey(),
      skipSend: true,
    });
    expect(result.didRegister).toBe(true);
    expect(result.transactionSignature).toBeUndefined();
    expect(result.status).toContain('skipSend');
  });

  it('does not call sendAndConfirmTransaction when skipSend=true', async () => {
    await createSolanaAgentIdentity({
      domain: 'agent.example.com',
      autoRegister: true,
      cluster: 'devnet',
      privateKey: makePrivateKey(),
      skipSend: true,
    });
    expect(mockSendAndConfirmTransaction.mock.calls).toHaveLength(0);
  });
});

describe('registerSolanaAgent', () => {
  it('forces autoRegister=true', async () => {
    const result = await registerSolanaAgent({
      domain: 'agent.example.com',
      cluster: 'devnet',
      privateKey: makePrivateKey(),
    });
    expect(result.didRegister).toBe(true);
  });
});

describe('getSolanaTrustConfig', () => {
  it('extracts trust from identity result', async () => {
    const result = await createSolanaAgentIdentity({
      domain: 'agent.example.com',
      autoRegister: true,
      cluster: 'devnet',
      privateKey: makePrivateKey(),
    });
    const trust = getSolanaTrustConfig(result);
    expect(trust).toBe(result.trust);
  });

  it('returns undefined when no trust available', async () => {
    const result = await createSolanaAgentIdentity({
      autoRegister: false,
      cluster: 'devnet',
    });
    const trust = getSolanaTrustConfig(result);
    expect(trust).toBeUndefined();
  });
});

describe('createSolanaAgentIdentity — custom trust models', () => {
  it('uses custom trustModels', async () => {
    const result = await createSolanaAgentIdentity({
      domain: 'agent.example.com',
      autoRegister: true,
      cluster: 'devnet',
      privateKey: makePrivateKey(),
      trustModels: ['tee-attestation'],
    });
    expect(result.trust?.trustModels).toEqual(['tee-attestation']);
  });
});
