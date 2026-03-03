// Main extension
export type { SolanaIdentityConfig } from './extension';
export { identitySolana } from './extension';

// Env helper
export { identitySolanaFromEnv } from './env';

// Core identity function
export type {
  CreateSolanaAgentIdentityOptions,
  SolanaAgentIdentity,
  SolanaAgentRegistrationOptions,
  SolanaRegistryClients,
} from './init';
export {
  createSdk,
  createSolanaAgentIdentity,
  getSolanaTrustConfig,
  mapTrustTierToConfig,
} from './init';

// Manifest helper
export { createAgentCardWithSolanaIdentity } from './manifest';

// Registry clients
export type {
  RegisterAgentOptions,
  RegisterAgentResult,
  SolanaAgentRecord,
  SolanaIdentityRegistryClient,
} from './registries/identity';
export { createSolanaIdentityRegistryClient } from './registries/identity';
export type {
  GiveFeedbackOptions,
  SolanaReputationRegistryClient,
  SolanaReputationSummary,
} from './registries/reputation';
export { createSolanaReputationRegistryClient } from './registries/reputation';

// Config helpers
export type { SolanaCluster } from './config';
export {
  CLUSTER_RPC_URLS,
  parseCluster,
  resolveRpcUrl,
  SOLANA_REGISTRATION_TYPE_V1,
} from './config';

// Validation helpers
export {
  hasRegistrationCapability,
  parseBoolean,
  parseSolanaPrivateKey,
  resolveAutoRegister,
  validateSolanaIdentityConfig,
} from './validation';
