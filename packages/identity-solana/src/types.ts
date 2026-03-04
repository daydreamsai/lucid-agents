import type { Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { TrustConfig } from "@lucid-agents/types/identity";

export type AnyRecord = Record<string, unknown>;
export type SolanaCluster = "mainnet-beta" | "devnet" | "testnet" | (string & {});

export interface BrowserWalletAdapterLike {
  publicKey?: PublicKey | string | { toBase58: () => string };
  signTransaction?: (transaction: unknown) => Promise<unknown>;
  signAllTransactions?: (transactions: unknown[]) => Promise<unknown[]>;
}

export interface IdentitySolanaConfig {
  privateKey?: number[];
  cluster?: SolanaCluster;
  rpcUrl?: string;
  domain?: string;
  registerIdentity?: boolean;
  pinataJwt?: string;
  atomEnabled?: boolean;
  skipSend?: boolean;
  walletAdapter?: BrowserWalletAdapterLike;
  identityProgramId?: string;
  reputationProgramId?: string;
  trust?: TrustConfig;
  commitment?: string;
  sdk?: Record<string, unknown>;
}

export interface SolanaTrustMetadata {
  trustTier?: string;
  asset?: string;
}

export interface RegistrySendOptions {
  skipSend?: boolean;
}

export interface SolanaAgentIdentity {
  id: string;
  did: string;
  chain: "solana";
  cluster: SolanaCluster;
  address: string;
  domain?: string;
  trust?: TrustConfig;
}

export interface SolanaRegistryClientState {
  connection: Connection;
  keypair?: Keypair;
  address?: string;
  identityClient?: unknown;
  reputationClient?: unknown;
}

export interface IdentitySolanaPluginOptions {
  config?: IdentitySolanaConfig;
}

export interface AgentPluginLike {
  name: string;
  setup?: (agent: AnyRecord) => Promise<void> | void;
  onManifestBuild?: (manifest: AnyRecord, ctx?: AnyRecord) => Promise<AnyRecord> | AnyRecord;
  hooks?: {
    setup?: (agent: AnyRecord) => Promise<void> | void;
    onManifestBuild?: (manifest: AnyRecord, ctx?: AnyRecord) => Promise<AnyRecord> | AnyRecord;
  };
}