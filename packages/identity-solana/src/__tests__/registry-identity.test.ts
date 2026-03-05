/**
 * Unit tests for SolanaIdentityRegistryClient
 * Mocks the Connection and sendAndConfirmTransaction.
 */

import { describe, expect, it, mock } from 'bun:test';
import type { SolanaIdentityRecord } from '../types.js';

// Build synthetic account data for an agent record
function buildAgentAccountData(agentId: number, owner: string, agentURI: string): Buffer {
  const uriBytes = Buffer.from(agentURI, 'utf8');
  const data = Buffer.alloc(41 + uriBytes.length);
  data.writeUInt8(1, 0); // is_initialized
  // owner (32 bytes) — we use a fake but valid-looking 32-byte buffer
  Buffer.from(owner.padEnd(32, '0').slice(0, 32)).copy(data, 1);
  data.writeUInt32LE(agentId, 33);
  data.writeUInt32LE(uriBytes.length, 37);
  uriBytes.copy(data, 41);
  return data;
}

// Build counter account data
function buildCounterAccountData(count: number): Buffer {
  const data = Buffer.alloc(4);
  data.writeUInt32LE(count, 0);
  return data;
}

mock.module('@solana/web3.js', () => {
  class MockPublicKey {
    private _val: string;
    constructor(value: any) {
      if (typeof value === 'string') {
        this._val = value;
      } else if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
        // Use base64-like representation for test purposes
        this._val = 'PubKey' + Buffer.from(value).toString('hex').slice(0, 8);
      } else {
        this._val = 'UnknownPubKey';
      }
    }
    toBase58() { return this._val; }
    static findProgramAddressSync(seeds: any, programId: any): [MockPublicKey, number] {
      const seedStr = seeds.map((s: Buffer) => s.toString('hex')).join('-');
      return [new MockPublicKey(`Pda:${seedStr}`), 255];
    }
  }

  class MockKeypair {
    publicKey = new MockPublicKey('OwnerPubKey11111111111111111111111111111111');
    secretKey = new Uint8Array(64);
    static fromSecretKey(sk: Uint8Array) {
      const kp = new MockKeypair();
      kp.secretKey = sk;
      return kp;
    }
  }

  // A mock Connection that can be configured per-test
  class MockConnection {
    private accountInfoMap: Map<string, any>;
    constructor() {
      this.accountInfoMap = new Map();
    }
    async getAccountInfo(pubkey: any, _commitment?: any) {
      const key = pubkey.toBase58?.() ?? String(pubkey);
      return this.accountInfoMap.get(key) ?? null;
    }
    _setAccountInfo(pubkey: string, data: Buffer | null) {
      if (data === null) {
        this.accountInfoMap.delete(pubkey);
      } else {
        this.accountInfoMap.set(pubkey, { data });
      }
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
    sendAndConfirmTransaction: mock(async () => 'txSig123'),
  };
});

import { createSolanaIdentityRegistryClient } from '../registries/identity.js';
import { Connection, Keypair } from '@solana/web3.js';

describe('SolanaIdentityRegistryClient', () => {
  function createClient() {
    const connection = new Connection('https://api.devnet.solana.com');
    const keypair = Keypair.generate?.() ?? (Keypair as any).fromSecretKey(new Uint8Array(64));
    return {
      client: createSolanaIdentityRegistryClient({
        connection,
        keypair: keypair as any,
        programId: 'AgentId11111111111111111111111111111111111111',
        cluster: 'devnet',
      }),
      connection,
    };
  }

  it('get returns null when account does not exist', async () => {
    const { client } = createClient();
    const result = await client.get(1);
    expect(result).toBeNull();
  });

  it('register returns agentId and signature', async () => {
    const { client } = createClient();
    const result = await client.register({
      agentURI: 'https://agent.example.com/.well-known/agent-registration.json',
    });
    expect(result.agentId).toBeGreaterThanOrEqual(0);
    expect(result.signature).toBe('txSig123');
  });

  it('register with skipSend returns null signature', async () => {
    const { client } = createClient();
    const result = await client.register({
      agentURI: 'https://agent.example.com/.well-known/agent-registration.json',
      skipSend: true,
    });
    expect(result.signature).toBeNull();
  });

  it('get returns null for non-existent account', async () => {
    const { client } = createClient();
    const record = await client.get(999);
    expect(record).toBeNull();
  });

  it('getByDomain returns null when no agents exist', async () => {
    const { client } = createClient();
    const record = await client.getByDomain('agent.example.com');
    expect(record).toBeNull();
  });
});
