// Main exports for @lucid-agents/identity-solana

export { identitySolana } from './extension';
export type { IdentityConfig } from './extension';

export { identitySolanaFromEnv } from './env';
export { createSolanaAgentIdentity, getSolanaTrustConfig, getSolanaIdentity, revokeSolanaIdentity } from './init';
export { createAgentCardWithSolanaIdentity, getTrustTierName, getTrustTierColor } from './manifest';
export {
  parseBoolean,
  validateCluster,
  validatePrivateKey,
  validateDomain,
  validateRegistration,
  validateIdentityConfig,
  parseSolanaConfigFromEnv,
} from './validation';

// Enums (value exports)
export { TrustTier } from './types';

// Types
export type {
SolanaIdentityConfig,
  SolanaRegistrationOptions,
  SolanaTrustConfig,
  SolanaTrustTierConfig,
  SolanaAgentRegistration,
  SolanaRegistryClients,
  CreateSolanaAgentIdentityOptions,
  SolanaValidationResult,
  SolanaFeedbackEntry,
} from './types';
