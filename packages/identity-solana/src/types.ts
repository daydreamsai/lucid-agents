/**
 * Solana Payment & Utility types for Lucid SDK
 * 
 * IMPORTANT: In the Lucid architecture, on-chain identity registration 
 * uses ERC-8004 on EVM networks. This package provides Solana-specific 
 * payment helpers and optional Solana identity ADAPTER (non-EVM) for 
 * payment/utility purposes, NOT as a replacement for ERC-8004 identity.
 */

import type { TrustConfig, AgentService } from '@lucid-agents/types/identity';

/**
 * Trust tier levels for Solana utility/payments
 */
export enum TrustTier {
  NONE = 0,
  BASIC = 1,
  VERIFIED = 2,
  PREMIUM = 3,
}

/**
 * Trust tier config for Solana payments
 */
export interface SolanaTrustTierConfig {
  tier: TrustTier;
  minStake?: number;
  verifiedAt?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Solana-specific TrustConfig for payment/utility features
 * Extends EVM TrustConfig with Solana-specific payment info
 */
export type SolanaTrustConfig = TrustConfig & {
  solana?: {
    trustTier?: SolanaTrustTierConfig;
    identityAccount?: string;
    registryProgram?: string;
  };
};

/**
 * Solana Payment Info - instead of identity registration
 * This package provides Solana payment/utility support, not ERC-8004 identity
 */
export type SolanaPaymentInfo = {
  namespace: 'solana';
  chainId: number;
  programId: string;
  paymentPDA?: string;
  signature?: string;
};

/**
 * Solana Registry Clients
 */
export interface SolanaRegistryClients {
  payments: {
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
 * Solana Identity/Payment Config
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
 * Registration options for Solana identity (optional, non-EVM adapter)
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
 * Create Solana Agent Identity options (for optional on-chain registration)
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

/**
 * Registration result from blockchain
 */
export interface SolanaRegistrationResult {
  trustTier: TrustTier;
  signature: string;
  registeredAt?: number;
}
