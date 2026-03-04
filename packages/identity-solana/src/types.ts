import type { TrustConfig, RegistrationEntry } from '@lucid-agents/types/identity';

/**
 * Solana cluster identifiers (mirrors @solana/web3.js Cluster type)
 */
export type SolanaCluster = 'mainnet-beta' | 'devnet' | 'testnet';

/**
 * A Solana agent identity record, returned by the on-chain Solana identity
 * registry (8004-solana).
 */
export type SolanaIdentityRecord = {
  /** Numeric agent ID (incremented PDA index) */
  agentId: number;
  /** Base58 owner wallet address */
  owner: string;
  /** URI pointing to the agent's registration JSON */
  agentURI: string;
  /** CAIP-2 network identifier, e.g. "solana:mainnet-beta" */
  network: string;
};

/**
 * Result returned by createSolanaAgentIdentity / identitySolana extension
 */
export type SolanaAgentIdentity = {
  /** Whether the agent was newly registered in this call */
  didRegister?: boolean;
  /** Whether this is the first/new registration */
  isNewRegistration?: boolean;
  /** Transaction signature if registered */
  transactionSignature?: string;
  /** Agent record from registry */
  record?: SolanaIdentityRecord;
  /** Trust config for agent manifest */
  trust?: TrustConfig;
  /** Human-readable status */
  status: string;
  /** Resolved domain */
  domain?: string;
  /** Registry clients */
  clients?: SolanaRegistryClients;
};

/**
 * Options for createSolanaAgentIdentity
 */
export type CreateSolanaAgentIdentityOptions = {
  /** Agent domain, e.g. "my-agent.example.com". Falls back to AGENT_DOMAIN env. */
  domain?: string;
  /** Auto-register if not found. Defaults to resolving from REGISTER_IDENTITY env. */
  autoRegister?: boolean;
  /** Solana cluster. Defaults to SOLANA_CLUSTER env or "mainnet-beta". */
  cluster?: SolanaCluster | string;
  /** Custom RPC endpoint. Falls back to SOLANA_RPC_URL env. */
  rpcUrl?: string;
  /** Base58-encoded private key as JSON array string. Falls back to SOLANA_PRIVATE_KEY env. */
  privateKey?: string;
  /** Trust models to advertise. Defaults to ["feedback", "inference-validation"]. */
  trustModels?: string[];
  /** Whether to skip sending transaction (for browser wallets that sign externally). */
  skipSend?: boolean;
  /** Custom env object (defaults to process.env). */
  env?: Record<string, string | undefined>;
  /** Optional logger */
  logger?: {
    info?(message: string): void;
    warn?(message: string, error?: unknown): void;
  };
  /** Pinata JWT for IPFS pinning (optional). Falls back to PINATA_JWT env. */
  pinataJwt?: string;
};

/**
 * Registry clients for Solana identity interactions (mirrors EVM RegistryClients shape)
 */
export type SolanaRegistryClients = {
  identity: SolanaIdentityRegistryClient;
  reputation: SolanaReputationRegistryClient;
};

/**
 * Client for the Solana identity registry (8004-solana program)
 */
export type SolanaIdentityRegistryClient = {
  /** Register a new agent. Returns agentId and transaction signature. */
  register(params: {
    agentURI: string;
    skipSend?: boolean;
  }): Promise<{ agentId: number; signature: string | null }>;

  /** Look up an agent by numeric ID. */
  get(agentId: number): Promise<SolanaIdentityRecord | null>;

  /** Look up agent by domain (scans for matching agentURI). */
  getByDomain(domain: string): Promise<SolanaIdentityRecord | null>;

  /** Revoke agent registration. */
  revoke(agentId: number): Promise<{ signature: string | null }>;
};

/**
 * Client for the Solana reputation registry (8004-solana program)
 */
export type SolanaReputationRegistryClient = {
  /** Give feedback to another agent */
  giveFeedback(params: {
    toAgentId: number;
    value: number;
    valueDecimals: number;
    tag1?: string;
    tag2?: string;
    endpoint?: string;
    feedbackURI?: string;
    skipSend?: boolean;
  }): Promise<{ signature: string | null }>;

  /** Revoke feedback you gave */
  revokeFeedback(params: {
    agentId: number;
    feedbackIndex: number;
    skipSend?: boolean;
  }): Promise<{ signature: string | null }>;

  /** Get reputation summary for an agent */
  getSummary(agentId: number): Promise<{
    value: number;
    valueDecimals: number;
    count: number;
  }>;

  /** Get all feedback for an agent */
  getAllFeedback(agentId: number): Promise<
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
  >;
};

/**
 * Config type used by the identitySolana() extension (mirrors IdentityConfig from @lucid-agents/identity)
 */
export type SolanaIdentityConfig = {
  trust?: TrustConfig;
  domain?: string;
  autoRegister?: boolean;
  cluster?: SolanaCluster | string;
  rpcUrl?: string;
  skipSend?: boolean;
};

/**
 * Maps a SolanaIdentityRecord to a CAIP-10 registration entry for TrustConfig.
 * Registry address is the program ID in CAIP-10 format: solana:{cluster}:{programId}
 */
export function toRegistrationEntry(
  record: SolanaIdentityRecord,
  programId: string,
  cluster: string
): RegistrationEntry {
  return {
    agentId: record.agentId.toString(),
    agentRegistry: `solana:${cluster}:${programId}`,
    agentAddress: `solana:${cluster}:${record.owner}`,
  };
}

/**
 * Build a TrustConfig from a Solana identity record
 */
export function buildSolanaTrustConfig(
  record: SolanaIdentityRecord,
  programId: string,
  cluster: string,
  trustModels: string[] = ['feedback', 'inference-validation']
): TrustConfig {
  return {
    registrations: [toRegistrationEntry(record, programId, cluster)],
    trustModels,
  };
}
