/**
 * Unit tests for SolanaReputationRegistryClient
 */

import { describe, expect, it, mock } from 'bun:test';

mock.module('@solana/web3.js', () => {
  class MockPublicKey {
    private _val: string;
    constructor(value: any) {
      this._val = typeof value === 'string' ? value : 'MockPubKey';
    }
    toBase58() { return this._val; }
    static findProgramAddressSync(_seeds: any, _programId: any): [MockPublicKey, number] {
      return [new MockPublicKey('MockFeedbackPda'), 255];
    }
  }
  class MockKeypair {
    publicKey = new MockPublicKey('ReputationOwner1111111111111111111111111111');
    secretKey = new Uint8Array(64);
    static fromSecretKey(sk: Uint8Array) {
      const kp = new MockKeypair();
      kp.secretKey = sk;
      return kp;
    }
    static generate() { return new MockKeypair(); }
  }
  class MockConnection {
    async getAccountInfo(_pubkey: any, _commitment?: any) { return null; }
  }
  class MockTransaction {
    add(_ix: any) { return this; }
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
    sendAndConfirmTransaction: mock(async () => 'repTxSig'),
  };
});

import { createSolanaReputationRegistryClient } from '../registries/reputation.js';
import { Connection, Keypair } from '@solana/web3.js';

describe('SolanaReputationRegistryClient', () => {
  function createClient() {
    const connection = new Connection('https://api.devnet.solana.com') as any;
    const keypair = (Keypair as any).generate();
    return createSolanaReputationRegistryClient({
      connection,
      keypair,
      programId: 'RepuId111111111111111111111111111111111111111',
      cluster: 'devnet',
    });
  }

  it('getSummary returns zero when no feedback account exists', async () => {
    const client = createClient();
    const summary = await client.getSummary(1);
    expect(summary.count).toBe(0);
    expect(summary.value).toBe(0);
  });

  it('getAllFeedback returns empty array when no feedback account', async () => {
    const client = createClient();
    const feedback = await client.getAllFeedback(1);
    expect(feedback).toEqual([]);
  });

  it('giveFeedback returns signature', async () => {
    const client = createClient();
    const result = await client.giveFeedback({
      toAgentId: 1,
      value: 90,
      valueDecimals: 0,
      tag1: 'reliable',
      tag2: 'fast',
      endpoint: 'https://agent.example.com',
    });
    expect(result.signature).toBe('repTxSig');
  });

  it('giveFeedback with skipSend returns null signature', async () => {
    const client = createClient();
    const result = await client.giveFeedback({
      toAgentId: 1,
      value: 80,
      valueDecimals: 0,
      skipSend: true,
    });
    expect(result.signature).toBeNull();
  });

  it('revokeFeedback returns signature', async () => {
    const client = createClient();
    const result = await client.revokeFeedback({
      agentId: 1,
      feedbackIndex: 0,
    });
    expect(result.signature).toBe('repTxSig');
  });

  it('revokeFeedback with skipSend returns null', async () => {
    const client = createClient();
    const result = await client.revokeFeedback({
      agentId: 1,
      feedbackIndex: 0,
      skipSend: true,
    });
    expect(result.signature).toBeNull();
  });

  it('throws when keypair is missing and write operation called', async () => {
    const connection = new Connection('https://api.devnet.solana.com') as any;
    const noKeyClient = createSolanaReputationRegistryClient({
      connection,
      programId: 'RepuId111111111111111111111111111111111111111',
      cluster: 'devnet',
    });
    expect(
      noKeyClient.giveFeedback({ toAgentId: 1, value: 80, valueDecimals: 0 })
    ).rejects.toThrow(/Keypair required/);
  });
});
