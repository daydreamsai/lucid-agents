import type { SolanaIdentityConfig, SolanaRegistrationOptions } from './types';

/**
 * Parse boolean string to boolean
 */
export function parseBoolean(value: string | undefined): boolean {
  if (value === undefined || value === '') return false;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Validate Solana cluster name
 */
export function validateCluster(
  cluster?: string
): 'mainnet-beta' | 'testnet' | 'devnet' {
  if (!cluster) return 'mainnet-beta';
  
  const validClusters = ['mainnet-beta', 'testnet', 'devnet'];
  if (validClusters.includes(cluster)) {
    return cluster as 'mainnet-beta' | 'testnet' | 'devnet';
  }
  
  console.warn(`[identity-solana] Invalid cluster "${cluster}", defaulting to mainnet-beta`);
  return 'mainnet-beta';
}

/**
 * Validate private key format
 */
export function validatePrivateKey(privateKey?: string): boolean {
  if (!privateKey) return false;
  
  // Check if it's a valid hex string (with or without 0x prefix)
  const hexRegex = /^(0x)?[0-9a-fA-F]{64}$/;
  return hexRegex.test(privateKey);
}

/**
 * Validate domain format
 */
export function validateDomain(domain?: string): boolean {
  if (!domain) return false;
  
  // Basic domain validation
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-_.]*[a-zA-Z0-9]$/;
  return domainRegex.test(domain);
}

/**
 * Validate registration options
 */
export function validateRegistration(
  registration?: SolanaRegistrationOptions
): registration is SolanaRegistrationOptions {
  if (!registration) return false;
  
  // Name is required
  if (!registration.name || typeof registration.name !== 'string') {
    return false;
  }
  
  // Name length check
  if (registration.name.length < 2 || registration.name.length > 64) {
    return false;
  }
  
  return true;
}

/**
 * Validate identity config
 */
export function validateIdentityConfig(
  config?: Partial<SolanaIdentityConfig>
): config is SolanaIdentityConfig {
  if (!config) return false;
  
  // If rpcUrl is provided, it should be a valid URL
  if (config.rpcUrl && !config.rpcUrl.startsWith('http')) {
    return false;
  }
  
  // If registration is provided, validate it
  if (config.registration && !validateRegistration(config.registration)) {
    return false;
  }
  
  return true;
}

/**
 * Parse Solana configuration from environment variables
 */
export function parseSolanaConfigFromEnv(): {
  privateKey?: string;
  cluster?: 'mainnet-beta' | 'testnet' | 'devnet';
  rpcUrl?: string;
} {
  if (typeof process === 'undefined') {
    return {};
  }
  
  const env = process.env as Record<string, string | undefined>;
  
  return {
    privateKey: env.SOLANA_PRIVATE_KEY,
    cluster: validateCluster(env.SOLANA_CLUSTER),
    rpcUrl: env.SOLANA_RPC_URL,
  };
}
