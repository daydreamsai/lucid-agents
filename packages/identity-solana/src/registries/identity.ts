/**
 * Solana Identity Registry Client
 *
 * Interacts with the 8004-solana on-chain program for agent identity.
 *
 * Architecture note:
 * - Uses @solana/web3.js for RPC calls and transaction building
 * - Program instructions are encoded as simple Borsh-compatible buffers
 * - Agent records stored as PDAs: [b"agent", agentId.to_le_bytes()]
 * - Counter PDA: [b"counter"] tracks total registered agents
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
import bs58 from './bs58-shim.js';

import type {
  SolanaIdentityRecord,
  SolanaIdentityRegistryClient,
} from '../types.js';

// Default program ID for the 8004-solana identity registry
// This is a placeholder — real program ID will be set when the program is deployed
export const DEFAULT_IDENTITY_PROGRAM_ID =
  'AgentId11111111111111111111111111111111111111';

export type SolanaIdentityRegistryClientOptions = {
  connection: Connection;
  keypair?: Keypair;
  programId?: string;
  cluster?: string;
  commitment?: Commitment;
};

// Instruction discriminators (first byte identifies the instruction)
const IX_REGISTER = 0;
const IX_REVOKE = 1;

/**
 * Encode a register instruction payload:
 * [discriminator(1), agentURI_len(4), agentURI(N)]
 */
function encodeRegisterInstruction(agentURI: string): Buffer {
  const uriBytes = Buffer.from(agentURI, 'utf8');
  const buf = Buffer.alloc(1 + 4 + uriBytes.length);
  buf.writeUInt8(IX_REGISTER, 0);
  buf.writeUInt32LE(uriBytes.length, 1);
  uriBytes.copy(buf, 5);
  return buf;
}

/**
 * Encode a revoke instruction payload:
 * [discriminator(1), agentId(4)]
 */
function encodeRevokeInstruction(agentId: number): Buffer {
  const buf = Buffer.alloc(5);
  buf.writeUInt8(IX_REVOKE, 0);
  buf.writeUInt32LE(agentId, 1);
  return buf;
}

/**
 * Derive the PDA for an agent account
 */
function deriveAgentPda(
  programId: PublicKey,
  agentId: number
): [PublicKey, number] {
  const idBuf = Buffer.alloc(4);
  idBuf.writeUInt32LE(agentId, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('agent'), idBuf],
    programId
  );
}

/**
 * Derive the PDA for the counter account
 */
function deriveCounterPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('counter')], programId);
}

/**
 * Parse an agent account data buffer.
 * Layout: [is_initialized(1), owner(32), agentId(4), uri_len(4), uri(N)]
 */
function parseAgentAccount(
  data: Buffer,
  agentId: number,
  cluster: string
): SolanaIdentityRecord | null {
  if (data.length < 41) return null;
  const isInitialized = data.readUInt8(0);
  if (!isInitialized) return null;
  const ownerBytes = data.slice(1, 33);
  const owner = new PublicKey(ownerBytes).toBase58();
  const storedAgentId = data.readUInt32LE(33);
  const uriLen = data.readUInt32LE(37);
  if (data.length < 41 + uriLen) return null;
  const agentURI = data.slice(41, 41 + uriLen).toString('utf8');
  return {
    agentId: storedAgentId,
    owner,
    agentURI,
    network: `solana:${cluster}`,
  };
}

/**
 * Parse the counter account to get total registered agents.
 * Layout: [count(4)]
 */
function parseCounterAccount(data: Buffer): number {
  if (data.length < 4) return 0;
  return data.readUInt32LE(0);
}

export function createSolanaIdentityRegistryClient(
  options: SolanaIdentityRegistryClientOptions
): SolanaIdentityRegistryClient {
  const {
    connection,
    keypair,
    programId: programIdStr = DEFAULT_IDENTITY_PROGRAM_ID,
    cluster = 'devnet',
    commitment = 'confirmed',
  } = options;

  let programId: PublicKey;
  try {
    programId = new PublicKey(programIdStr);
  } catch {
    throw new Error(
      `[identity-solana] Invalid program ID: ${programIdStr}. ` +
        'Set SOLANA_IDENTITY_PROGRAM_ID to a valid base58 public key.'
    );
  }

  async function register(params: {
    agentURI: string;
    skipSend?: boolean;
  }): Promise<{ agentId: number; signature: string | null }> {
    if (!keypair) {
      throw new Error(
        '[identity-solana] Keypair required to register agent. ' +
          'Provide SOLANA_PRIVATE_KEY env var (JSON array of bytes).'
      );
    }

    const [counterPda] = deriveCounterPda(programId);

    // Read current counter to predict next agent ID
    let nextAgentId = 0;
    try {
      const counterInfo = await connection.getAccountInfo(
        counterPda,
        commitment
      );
      if (counterInfo?.data) {
        nextAgentId = parseCounterAccount(
          Buffer.from(counterInfo.data)
        );
      }
    } catch {
      // Counter may not exist yet (first registration)
      nextAgentId = 0;
    }

    const [agentPda] = deriveAgentPda(programId, nextAgentId);

    const instruction = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: counterPda, isSigner: false, isWritable: true },
        { pubkey: agentPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeRegisterInstruction(params.agentURI),
    });

    if (params.skipSend) {
      // Browser wallet mode: build transaction but don't send
      return { agentId: nextAgentId, signature: null };
    }

    const tx = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [keypair],
      { commitment }
    );
    return { agentId: nextAgentId, signature };
  }

  async function get(agentId: number): Promise<SolanaIdentityRecord | null> {
    const [agentPda] = deriveAgentPda(programId, agentId);
    try {
      const accountInfo = await connection.getAccountInfo(
        agentPda,
        commitment
      );
      if (!accountInfo?.data) return null;
      return parseAgentAccount(Buffer.from(accountInfo.data), agentId, cluster);
    } catch {
      return null;
    }
  }

  async function getByDomain(
    domain: string
  ): Promise<SolanaIdentityRecord | null> {
    // Normalize domain to expected agentURI
    const normalized = domain.startsWith('http')
      ? domain.replace(/\/$/, '')
      : `https://${domain}`;
    const expectedURI = `${normalized}/.well-known/agent-registration.json`;

    // Read counter to know how many agents exist
    const [counterPda] = deriveCounterPda(programId);
    let count = 0;
    try {
      const counterInfo = await connection.getAccountInfo(
        counterPda,
        commitment
      );
      if (counterInfo?.data) {
        count = parseCounterAccount(Buffer.from(counterInfo.data));
      }
    } catch {
      return null;
    }

    // Scan agent PDAs (practical for small registries; production would use indexed off-chain)
    for (let id = 0; id < count; id++) {
      const record = await get(id);
      if (
        record &&
        (record.agentURI === expectedURI ||
          record.agentURI.includes(normalized))
      ) {
        return record;
      }
    }
    return null;
  }

  async function revoke(
    agentId: number
  ): Promise<{ signature: string | null }> {
    if (!keypair) {
      throw new Error(
        '[identity-solana] Keypair required to revoke agent registration.'
      );
    }

    const [agentPda] = deriveAgentPda(programId, agentId);
    const instruction = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: agentPda, isSigner: false, isWritable: true },
      ],
      data: encodeRevokeInstruction(agentId),
    });

    const tx = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(connection, tx, [keypair], {
      commitment,
    });
    return { signature };
  }

  return { register, get, getByDomain, revoke };
}
