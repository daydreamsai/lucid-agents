/**
 * Thin wrapper around 8004-solana's identity/registration capabilities.
 * Uses the published TypeScript declarations from 8004-solana directly.
 */

import type { IndexedAgent } from '8004-solana';
import { SolanaSDK } from '8004-solana';

export type SolanaAgentRecord = {
  agentId: string | number | null;
  owner: string;
  uri: string;
  cluster: string;
};

export type RegisterAgentOptions = {
  domain: string;
  name?: string;
  description?: string;
  image?: string;
  agentURI?: string;
  /** If true, skip sending the on-chain transaction (browser wallet flow) */
  skipSend?: boolean;
};

export type RegisterAgentResult = {
  agentId?: string | number;
  transactionSignature?: string;
  didRegister: boolean;
  alreadyExists: boolean;
  /** Base64-serialised unsigned transaction for browser-wallet signing */
  unsignedTransaction?: Uint8Array;
};

export type SolanaIdentityRegistryClient = {
  getAgent(
    agentId: string | number | bigint
  ): Promise<SolanaAgentRecord | null>;
  getAgentByOwner(ownerAddress: string): Promise<SolanaAgentRecord | null>;
  registerAgent(opts: RegisterAgentOptions): Promise<RegisterAgentResult>;
};

function mapIndexedAgent(
  agent: IndexedAgent,
  fallbackCluster: string
): SolanaAgentRecord {
  return {
    agentId: agent.agent_id ?? null,
    owner: agent.owner ?? '',
    uri: agent.agent_uri ?? '',
    cluster: fallbackCluster,
  };
}

/**
 * Create a Solana identity registry client wrapping SolanaSDK.
 */
export function createSolanaIdentityRegistryClient(
  sdk: InstanceType<typeof SolanaSDK>
): SolanaIdentityRegistryClient {
  const cluster =
    (sdk as { getCluster?(): string }).getCluster?.() ?? 'mainnet-beta';

  return {
    async getAgent(agentId) {
      // Only return null when the agent genuinely does not exist.
      // Rethrow SDK/network errors so callers can distinguish "not found" from failures.
      let agent: IndexedAgent | null;
      try {
        agent = await sdk.getAgentByAgentId(agentId);
      } catch (err: unknown) {
        throw new Error(
          `getAgent: failed to fetch agent ${agentId} (cluster=${cluster}): ` +
            (err instanceof Error ? err.message : String(err))
        );
      }
      if (!agent) return null;
      return mapIndexedAgent(agent, cluster);
    },

    async getAgentByOwner(ownerAddress) {
      let agent: IndexedAgent | null;
      try {
        agent = await sdk.getAgentByWallet(ownerAddress);
      } catch (err: unknown) {
        throw new Error(
          `getAgentByOwner: failed to fetch agent for owner ${ownerAddress} (cluster=${cluster}): ` +
            (err instanceof Error ? err.message : String(err))
        );
      }
      if (!agent) return null;
      return mapIndexedAgent(agent, cluster);
    },

    async registerAgent(opts) {
      const tokenUri =
        opts.agentURI ??
        `https://${opts.domain}/.well-known/agent-registration.json`;

      if (opts.skipSend) {
        // Browser wallet mode: ask the SDK to build and serialise the transaction
        // without broadcasting so the browser wallet can sign and send it.
        const { Keypair } = await import('@solana/web3.js');
        const assetKeypair = Keypair.generate();
        const prepared = await sdk.registerAgent(tokenUri, {
          skipSend: true,
          assetPubkey: assetKeypair.publicKey,
        });
        // PreparedTransaction.transaction is a Base64-encoded serialised tx.
        const txBase64 =
          (prepared as { transaction: string }).transaction ?? '';
        return {
          didRegister: false,
          alreadyExists: false,
          unsignedTransaction: new Uint8Array(Buffer.from(txBase64, 'base64')),
        };
      }

      try {
        const result = await sdk.registerAgent(tokenUri);
        return {
          agentId:
            (result as { agentId?: string | number }).agentId ??
            (result as { agent_id?: string | number }).agent_id,
          transactionSignature:
            (result as { signature?: string }).signature ??
            (result as { tx?: string }).tx,
          didRegister: true,
          alreadyExists: false,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('already') || msg.includes('exists')) {
          return { didRegister: false, alreadyExists: true };
        }
        throw err;
      }
    },
  };
}
