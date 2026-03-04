import type { AgentService } from '@lucid-agents/types/identity';
import type {
  SolanaIdentityConfig,
  SolanaRegistrationOptions,
  SolanaTrustConfig,
} from './types';
import {
  parseBoolean,
  validateCluster,
  validatePrivateKey,
  parseSolanaConfigFromEnv,
} from './validation';

/**
 * Creates SolanaIdentityConfig from environment variables
 *
 * Environment variables:
 * - SOLANA_PRIVATE_KEY: Private key as hex string (optional, for signing)
 * - SOLANA_CLUSTER: mainnet-beta | testnet | devnet (default: mainnet-beta)
 * - SOLANA_RPC_URL: RPC endpoint URL
 * - AGENT_DOMAIN: Agent domain for registration
 * - REGISTER_IDENTITY or IDENTITY_AUTO_REGISTER: Auto-register if not found
 * - PINATA_JWT: Pinata JWT for IPFS uploads
 * - ATOM_ENABLED: Enable ATOM protocol support
 *
 * @param configOverrides - Optional config overrides
 * @returns SolanaIdentityConfig from env + overrides
 */
export function identitySolanaFromEnv(
  configOverrides?: Partial<SolanaIdentityConfig>
): SolanaIdentityConfig {
  const envConfig = parseSolanaConfigFromEnv();
  
  const domain = configOverrides?.domain ?? process.env?.AGENT_DOMAIN;
  
  // Parse autoRegister
  let autoRegister: boolean | undefined = configOverrides?.autoRegister;
  if (autoRegister === undefined) {
    const registerEnv = process.env?.REGISTER_IDENTITY ?? process.env?.IDENTITY_AUTO_REGISTER;
    if (registerEnv !== undefined) {
      autoRegister = parseBoolean(registerEnv);
    }
  }
  
  // Parse registration services
  const services: AgentService[] = [];
  
  if (parseBoolean(process.env?.SOLANA_INCLUDE_A2A)) {
    services.push({
      name: 'A2A',
      endpoint: process.env?.SOLANA_A2A_ENDPOINT ?? '',
      version: process.env?.SOLANA_A2A_VERSION,
    });
  }
  
  if (parseBoolean(process.env?.SOLANA_INCLUDE_WEB)) {
    services.push({
      name: 'web',
      endpoint: process.env?.SOLANA_WEB_ENDPOINT ?? '',
    });
  }
  
  // Parse skipSend for browser wallets
  const skipSend = parseBoolean(process.env?.SKIP_SEND);
  
  // Parse PINATA_JWT for IPFS uploads
  const pinataJwt = process.env?.PINATA_JWT;
  
  // Parse ATOM protocol support
  const atomEnabled = parseBoolean(process.env?.ATOM_ENABLED);
  
  let registration: SolanaRegistrationOptions | undefined;
  
  if (services.length > 0 || domain || configOverrides?.registration) {
    registration = {
      name: configOverrides?.registration?.name ?? process.env?.AGENT_NAME ?? 'Solana Agent',
      description: configOverrides?.registration?.description ?? process.env?.AGENT_DESCRIPTION,
      image: configOverrides?.registration?.image ?? process.env?.AGENT_IMAGE,
      url: configOverrides?.registration?.url ?? process.env?.AGENT_URL,
      domain: configOverrides?.registration?.domain ?? domain,
      services: configOverrides?.registration?.services ?? services,
      x402Support: parseBoolean(process.env?.AGENT_X402_SUPPORT),
      skipSend: parseBoolean(process.env?.SKIP_SEND),
    };
  }
  
  // Add IPFS/ATOM config to registration if present
  if (pinataJwt || atomEnabled) {
    const metadata: Record<string, unknown> = {};
    if (pinataJwt) metadata.pinataJwt = pinataJwt;
    if (atomEnabled) metadata.atomEnabled = atomEnabled;
    registration = { ...registration, metadata };
  }
  
  return {
    trust: configOverrides?.trust,
    domain,
    autoRegister,
    rpcUrl: configOverrides?.rpcUrl ?? envConfig.rpcUrl,
    cluster: configOverrides?.cluster ?? envConfig.cluster,
    registration,
  };
}

/**
 * Check if Solana identity is configured for auto-registration
 * Only returns true when explicit configuration exists
 */
export function isSolanaIdentityConfigured(config: SolanaIdentityConfig): boolean {
  return Boolean(
    config.rpcUrl ||
    config.registration ||
    process.env?.SOLANA_PRIVATE_KEY
  );
}
