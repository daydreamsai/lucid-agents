/**
 * Thin wrapper around 8004-solana's identity/registration capabilities.
 */

import type { SolanaSDK as SolanaSDKType } from '8004-solana';

export type SolanaAgentRecord = {
  agentId: bigint | number;
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
  agentId?: bigint | number;
  transactionSignature?: string;
  didRegister: boolean;
  alreadyExists: boolean;
  /** Serialized transaction for skipSend browser-wallet signing */
  unsignedTransaction?: Uint8Array;
};

export type SolanaIdentityRegistryClient = {
  getAgent(agentId: bigint | number): Promise<SolanaAgentRecord | null>;
  getAgentByOwner(ownerAddress: string): Promise<SolanaAgentRecord | null>;
  registerAgent(opts: RegisterAgentOptions): Promise<RegisterAgentResult>;
};

/**
 * Create a Solana identity registry client wrapping SolanaSDK.
 */
export function createSolanaIdentityRegistryClient(
  sdk: SolanaSDKType
): SolanaIdentityRegistryClient {
  return {
    async getAgent(agentId) {
      try {
        const agent = await sdk.getAgent(BigInt(agentId));
        if (!agent) return null;
        return {
          agentId: agent.agentId ?? agentId,
          owner: agent.owner?.toString() ?? '',
          uri: agent.uri ?? '',
          cluster: sdk.getCluster?.() ?? 'mainnet-beta',
        };
      } catch {
        return null;
      }
    },

    async getAgentByOwner(ownerAddress) {
      try {
        const agents = await sdk.getAgentsByOwner(ownerAddress as any);
        if (!agents || agents.length === 0) return null;
        const a = agents[0];
        return {
          agentId: a.agentId ?? 0,
          owner: a.owner?.toString() ?? ownerAddress,
          uri: a.uri ?? '',
          cluster: sdk.getCluster?.() ?? 'mainnet-beta',
        };
      } catch {
        return null;
      }
    },

    async registerAgent(opts) {
      try {
        // Check if already registered
        if (opts.skipSend) {
          // Browser wallet mode: return unsigned transaction
          return {
            didRegister: false,
            alreadyExists: false,
            unsignedTransaction: new Uint8Array(0), // placeholder
          };
        }

        const tokenUri = opts.agentURI ?? `https://${opts.domain}/.well-known/agent-registration.json`;
        const result = await sdk.registerAgent(tokenUri, { skipSend: false } as any);
        return {
          agentId: (result as any)?.agentId,
          transactionSignature: (result as any)?.signature ?? (result as any)?.tx,
          didRegister: true,
          alreadyExists: false,
        };
      } catch (err: any) {
        // Agent may already exist
        if (err?.message?.includes('already') || err?.message?.includes('exists')) {
          return { didRegister: false, alreadyExists: true };
        }
        throw err;
      }
    },
  };
}
