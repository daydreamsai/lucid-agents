/**
 * Solana Reputation Registry Client
 *
 * Interfaces with the 8004-solana reputation program, mirroring the EVM
 * ReputationRegistryClient from @lucid-agents/identity.
 *
 * Instruction layout:
 *   0 = giveFeedback
 *   1 = revokeFeedback
 *   2 = appendResponse (future)
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  type Commitment,
} from '@solana/web3.js';

import type { SolanaReputationRegistryClient } from '../types.js';

export const DEFAULT_REPUTATION_PROGRAM_ID =
  'RepuId111111111111111111111111111111111111111';

export type SolanaReputationRegistryClientOptions = {
  connection: Connection;
  keypair?: Keypair;
  programId?: string;
  cluster?: string;
  commitment?: Commitment;
};

const IX_GIVE_FEEDBACK = 0;
const IX_REVOKE_FEEDBACK = 1;

/**
 * Encode giveFeedback instruction:
 * [discriminator(1), toAgentId(4), value(1), valueDecimals(1),
 *  tag1_len(2), tag1(N), tag2_len(2), tag2(N),
 *  endpoint_len(2), endpoint(N), feedbackURI_len(2), feedbackURI(N)]
 */
function encodeGiveFeedback(params: {
  toAgentId: number;
  value: number;
  valueDecimals: number;
  tag1: string;
  tag2: string;
  endpoint: string;
  feedbackURI: string;
}): Buffer {
  const tag1Buf = Buffer.from(params.tag1, 'utf8');
  const tag2Buf = Buffer.from(params.tag2, 'utf8');
  const endpointBuf = Buffer.from(params.endpoint, 'utf8');
  const feedbackURIBuf = Buffer.from(params.feedbackURI, 'utf8');

  const totalLen =
    1 + 4 + 1 + 1 +
    2 + tag1Buf.length +
    2 + tag2Buf.length +
    2 + endpointBuf.length +
    2 + feedbackURIBuf.length;

  const buf = Buffer.alloc(totalLen);
  let offset = 0;
  buf.writeUInt8(IX_GIVE_FEEDBACK, offset); offset += 1;
  buf.writeUInt32LE(params.toAgentId, offset); offset += 4;
  buf.writeUInt8(Math.max(0, Math.min(255, params.value)), offset); offset += 1;
  buf.writeUInt8(Math.max(0, Math.min(255, params.valueDecimals)), offset); offset += 1;
  buf.writeUInt16LE(tag1Buf.length, offset); offset += 2;
  tag1Buf.copy(buf, offset); offset += tag1Buf.length;
  buf.writeUInt16LE(tag2Buf.length, offset); offset += 2;
  tag2Buf.copy(buf, offset); offset += tag2Buf.length;
  buf.writeUInt16LE(endpointBuf.length, offset); offset += 2;
  endpointBuf.copy(buf, offset); offset += endpointBuf.length;
  buf.writeUInt16LE(feedbackURIBuf.length, offset); offset += 2;
  feedbackURIBuf.copy(buf, offset);
  return buf;
}

/**
 * Encode revokeFeedback instruction:
 * [discriminator(1), agentId(4), feedbackIndex(4)]
 */
function encodeRevokeFeedback(agentId: number, feedbackIndex: number): Buffer {
  const buf = Buffer.alloc(9);
  buf.writeUInt8(IX_REVOKE_FEEDBACK, 0);
  buf.writeUInt32LE(agentId, 1);
  buf.writeUInt32LE(feedbackIndex, 5);
  return buf;
}

/**
 * Derive the PDA for an agent's feedback list
 */
function deriveFeedbackPda(
  programId: PublicKey,
  agentId: number
): [PublicKey, number] {
  const idBuf = Buffer.alloc(4);
  idBuf.writeUInt32LE(agentId, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('feedback'), idBuf],
    programId
  );
}

type FeedbackEntry = {
  from: string;
  value: number;
  valueDecimals: number;
  tag1: string;
  tag2: string;
  endpoint: string;
  feedbackURI: string;
  timestamp: number;
  revoked: boolean;
};

/**
 * Parse feedback account data.
 * Layout: [count(4), entries[]]
 * Entry: [is_revoked(1), from(32), value(1), valueDecimals(1), timestamp(8),
 *         tag1_len(2), tag1(N), tag2_len(2), tag2(N),
 *         endpoint_len(2), endpoint(N), feedbackURI_len(2), feedbackURI(N)]
 */
function parseFeedbackAccount(data: Buffer): FeedbackEntry[] {
  if (data.length < 4) return [];
  const count = data.readUInt32LE(0);
  const entries: FeedbackEntry[] = [];
  let offset = 4;

  for (let i = 0; i < count && offset < data.length; i++) {
    if (offset + 44 > data.length) break;
    const revoked = data.readUInt8(offset) !== 0; offset += 1;
    const fromBytes = data.slice(offset, offset + 32); offset += 32;
    const from = new PublicKey(fromBytes).toBase58();
    const value = data.readUInt8(offset); offset += 1;
    const valueDecimals = data.readUInt8(offset); offset += 1;
    const timestamp = Number(data.readBigUInt64LE(offset)); offset += 8;

    const tag1Len = data.readUInt16LE(offset); offset += 2;
    const tag1 = data.slice(offset, offset + tag1Len).toString('utf8'); offset += tag1Len;
    const tag2Len = data.readUInt16LE(offset); offset += 2;
    const tag2 = data.slice(offset, offset + tag2Len).toString('utf8'); offset += tag2Len;
    const endpointLen = data.readUInt16LE(offset); offset += 2;
    const endpoint = data.slice(offset, offset + endpointLen).toString('utf8'); offset += endpointLen;
    const feedbackURILen = data.readUInt16LE(offset); offset += 2;
    const feedbackURI = data.slice(offset, offset + feedbackURILen).toString('utf8'); offset += feedbackURILen;

    entries.push({ from, value, valueDecimals, tag1, tag2, endpoint, feedbackURI, timestamp, revoked });
  }
  return entries;
}

export function createSolanaReputationRegistryClient(
  options: SolanaReputationRegistryClientOptions
): SolanaReputationRegistryClient {
  const {
    connection,
    keypair,
    programId: programIdStr = DEFAULT_REPUTATION_PROGRAM_ID,
    commitment = 'confirmed',
  } = options;

  let programId: PublicKey;
  try {
    programId = new PublicKey(programIdStr);
  } catch {
    throw new Error(
      `[identity-solana] Invalid reputation program ID: ${programIdStr}`
    );
  }

  async function giveFeedback(params: {
    toAgentId: number;
    value: number;
    valueDecimals: number;
    tag1?: string;
    tag2?: string;
    endpoint?: string;
    feedbackURI?: string;
    skipSend?: boolean;
  }): Promise<{ signature: string | null }> {
    if (!keypair) {
      throw new Error(
        '[identity-solana] Keypair required to give feedback.'
      );
    }

    const [feedbackPda] = deriveFeedbackPda(programId, params.toAgentId);
    const instruction = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: feedbackPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeGiveFeedback({
        toAgentId: params.toAgentId,
        value: params.value,
        valueDecimals: params.valueDecimals,
        tag1: params.tag1 ?? '',
        tag2: params.tag2 ?? '',
        endpoint: params.endpoint ?? '',
        feedbackURI: params.feedbackURI ?? '',
      }),
    });

    if (params.skipSend) {
      return { signature: null };
    }

    const tx = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [keypair],
      { commitment }
    );
    return { signature };
  }

  async function revokeFeedback(params: {
    agentId: number;
    feedbackIndex: number;
    skipSend?: boolean;
  }): Promise<{ signature: string | null }> {
    if (!keypair) {
      throw new Error(
        '[identity-solana] Keypair required to revoke feedback.'
      );
    }

    const [feedbackPda] = deriveFeedbackPda(programId, params.agentId);
    const instruction = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: feedbackPda, isSigner: false, isWritable: true },
      ],
      data: encodeRevokeFeedback(params.agentId, params.feedbackIndex),
    });

    if (params.skipSend) {
      return { signature: null };
    }

    const tx = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [keypair],
      { commitment }
    );
    return { signature };
  }

  async function getSummary(agentId: number): Promise<{
    value: number;
    valueDecimals: number;
    count: number;
  }> {
    const [feedbackPda] = deriveFeedbackPda(programId, agentId);
    try {
      const accountInfo = await connection.getAccountInfo(feedbackPda, commitment);
      if (!accountInfo?.data) return { value: 0, valueDecimals: 0, count: 0 };
      const entries = parseFeedbackAccount(Buffer.from(accountInfo.data));
      const active = entries.filter(e => !e.revoked);
      if (active.length === 0) return { value: 0, valueDecimals: 0, count: 0 };
      const maxDecimals = Math.max(...active.map(e => e.valueDecimals));
      const total = active.reduce((sum, e) => {
        const scale = 10 ** (maxDecimals - e.valueDecimals);
        return sum + e.value * scale;
      }, 0);
      return {
        value: Math.round(total / active.length),
        valueDecimals: maxDecimals,
        count: active.length,
      };
    } catch {
      return { value: 0, valueDecimals: 0, count: 0 };
    }
  }

  async function getAllFeedback(agentId: number): Promise<
    Array<{
      from: string;
      value: number;
      valueDecimals: number;
      tag1: string;
      tag2: string;
      endpoint: string;
      feedbackURI: string;
      timestamp: number;
    }>
  > {
    const [feedbackPda] = deriveFeedbackPda(programId, agentId);
    try {
      const accountInfo = await connection.getAccountInfo(feedbackPda, commitment);
      if (!accountInfo?.data) return [];
      const entries = parseFeedbackAccount(Buffer.from(accountInfo.data));
      return entries
        .filter(e => !e.revoked)
        .map(({ revoked: _r, ...rest }) => rest);
    } catch {
      return [];
    }
  }

  return { giveFeedback, revokeFeedback, getSummary, getAllFeedback };
}
