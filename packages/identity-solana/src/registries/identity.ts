/**
 * Thin wrapper around 8004-solana's identity/registration capabilities.
 */

// @ts-ignore — 8004-solana is a peer dependency
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
  /** Serialized transaction for skipSend browser-wallet signing */
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
  agent: any,
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
  const cluster = (sdk as any).getCluster?.() ?? 'mainnet-beta';

  return {
    async getAgent(agentId) {
      try {
        const agent = await sdk.getAgentByAgentId(agentId);
        if (!agent) return null;
        return mapIndexedAgent(agent, cluster);
      } catch {
        return null;
      }
    },

    async getAgentByOwner(ownerAddress) {
      try {
        // getAgentByWallet looks up by wallet address string via indexer
        const agent = await sdk.getAgentByWallet(ownerAddress);
        if (!agent) return null;
        return mapIndexedAgent(agent, cluster);
      } catch {
        return null;
      }
    },

    async registerAgent(opts) {
      if (opts.skipSend) {
        // Browser wallet mode: return placeholder unsigned transaction
        return {
          didRegister: false,
          alreadyExists: false,
          unsignedTransaction: new Uint8Array(0),
        };
      }

      try {
        const tokenUri =
          opts.agentURI ??
          `https://${opts.domain}/.well-known/agent-registration.json`;
        const result = await sdk.registerAgent(tokenUri);
        return {
          agentId: (result as any)?.agentId ?? (result as any)?.agent_id,
          transactionSignature:
            (result as any)?.signature ?? (result as any)?.tx,
          didRegister: true,
          alreadyExists: false,
        };
      } catch (err: any) {
        if (
          err?.message?.includes('already') ||
          err?.message?.includes('exists')
        ) {
          return { didRegister: false, alreadyExists: true };
        }
        throw err;
      }
    },
  };
}
