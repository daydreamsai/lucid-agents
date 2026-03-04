/**
 * Solana Identity types - ERC-8004 equivalent for Solana blockchain
 */

import type { TrustConfig, AgentRegistration, OASFStructuredConfig, AgentService } from '@lucid-agents/types/identity';

/**
 * Trust tier levels for Solana identity
 */
export enum TrustTier {
  NONE = 0,
  BASIC = 1,
  VERIFIED = 2,
  PREMIUM = 3,
}

/**
 * Trust tier config for Solana
 */
export interface SolanaTrustTierConfig {
  tier: TrustTier;
  minStake?: number;
  verifiedAt?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Solana-specific TrustConfig that extends EVM TrustConfig
 */
export type SolanaTrustConfig = TrustConfig & {
  solana?: {
    trustTier?: SolanaTrustTierConfig;
    identityAccount?: string;
    registryProgram?: string;
  };
};

/**
 * Solana Agent Registration - similar to ERC-8004 but for Solana
 */
export type SolanaAgentRegistration = Omit<AgentRegistration, 'registrations'> & {
  namespace: 'solana';
  chainId: number;
  programId: string;
  registryPDA: string;
  identityPDA?: string;
  signature?: string;
};

/**
 * Solana Registry Clients
 */
export interface SolanaRegistryClients {
  identity: {
    programId: string;
    rpcUrl: string;
    connection?: unknown;
  };
  reputation?: {
    programId: string;
    rpcUrl: string;
    connection?: unknown;
  };
}

/**
 * Solana Identity Config
 */
export interface SolanaIdentityConfig {
  trust?: SolanaTrustConfig;
  domain?: string;
  autoRegister?: boolean;
  rpcUrl?: string;
  cluster?: 'mainnet-beta' | 'testnet' | 'devnet';
  registration?: SolanaRegistrationOptions;
}

/**
 * Registration options for Solana identity
 */
export interface SolanaRegistrationOptions {
  name: string;
  description?: string;
  image?: string;
  url?: string;
  domain?: string;
  services?: AgentService[];
  x402Support?: boolean;
  skipSend?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Create Solana Agent Identity options
 */
export interface CreateSolanaAgentIdentityOptions {
  runtime: unknown;
  domain?: string;
  autoRegister?: boolean;
  rpcUrl?: string;
  cluster?: 'mainnet-beta' | 'testnet' | 'devnet';
  registration?: SolanaRegistrationOptions;
}

/**
 * Validation result from Solana registry
 */
export interface SolanaValidationResult {
  isValid: boolean;
  trustTier: TrustTier;
  validatedAt: number;
  metadata?: Record<string, unknown>;
}

/**
 * Feedback entry for reputation system
 */
export interface SolanaFeedbackEntry {
  from: string;
  to: string;
  rating: number;
  comment?: string;
  timestamp: number;
  txHash?: string;
}
