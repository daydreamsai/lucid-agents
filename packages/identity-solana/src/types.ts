import type { TrustConfig } from "@lucid-agents/types/identity";

export type SolanaCluster = "mainnet-beta" | "devnet" | "testnet" | (string & {});

export interface BrowserWalletAdapter {
  publicKey?: string | { toBase58?: () => string; toString?: () => string };
  signTransaction?: (transaction: unknown) => Promise<unknown>;
  signAllTransactions?: (transactions: unknown[]) => Promise<unknown[]>;
  sendTransaction?: (...args: unknown[]) => Promise<string>;
}

export interface IdentitySolanaConfig {
  cluster: SolanaCluster;
  rpcUrl?: string;
  privateKey?: Uint8Array;
  wallet?: BrowserWalletAdapter;
  agentDomain?: string;
  registerIdentity: boolean;
  pinataJwt?: string;
  atomEnabled: boolean;
  skipSend?: boolean;
}

export interface RegisterIdentityParams {
  agentDomain: string;
  metadataUri?: string;
  trust?: TrustConfig;
  skipSend?: boolean;
  [key: string]: unknown;
}

export interface RevokeIdentityParams {
  identityId?: string;
  reason?: string;
  skipSend?: boolean;
  [key: string]: unknown;
}

export interface ReputationFeedbackParams {
  to: string;
  score: number;
  comment?: string;
  paid?: boolean;
  skipSend?: boolean;
  [key: string]: unknown;
}

export interface SolanaIdentityRegistrationResult {
  address?: string;
  identityId?: string;
  txid?: string;
  trust?: TrustConfig;
  trustTier?: string;
  asset?: unknown;
  [key: string]: unknown;
}

export interface SolanaTxResult {
  txid?: string;
  signature?: string;
  [key: string]: unknown;
}

export interface SolanaRegistryIdentityClient {
  register(params: RegisterIdentityParams): Promise<SolanaIdentityRegistrationResult>;
  revoke(params: RevokeIdentityParams): Promise<SolanaTxResult>;
}

export interface SolanaRegistryReputationClient {
  feedback(params: ReputationFeedbackParams): Promise<SolanaTxResult>;
}

export interface SolanaRegistryClients {
  identity: SolanaRegistryIdentityClient;
  reputation: SolanaRegistryReputationClient;
}

export type SolanaSdkFactory = (config: IdentitySolanaConfig) => Promise<unknown> | unknown;

export interface IdentitySolanaOptions {
  config?: Partial<IdentitySolanaConfig>;
  clients?: SolanaRegistryClients | Promise<SolanaRegistryClients>;
  sdkFactory?: SolanaSdkFactory;
}

export interface SolanaAgentIdentity {
  chain: "solana";
  cluster: SolanaCluster;
  address: string;
  identityId?: string;
  txid?: string;
  trust?: TrustConfig;
  raw?: unknown;
}