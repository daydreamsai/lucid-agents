/**
 * @lucid-agents/identity-solana
 *
 * Solana identity for the Lucid SDK. Mirrors the @lucid-agents/identity (EVM) API
 * but uses the Solana 8004-solana program and @solana/web3.js.
 *
 * Quick start:
 * ```ts
 * import { createAgent } from '@lucid-agents/core';
 * import { identitySolana, identitySolanaFromEnv } from '@lucid-agents/identity-solana';
 *
 * const agent = await createAgent({ name: 'my-agent', version: '1.0.0' })
 *   .use(identitySolana({ config: identitySolanaFromEnv() }))
 *   .build();
 * ```
 */

// Extension API (mirrors identity() from @lucid-agents/identity)
export { identitySolana, createAgentCardWithSolanaIdentity } from './extension.js';
export type { SolanaIdentityConfig } from './extension.js';

// Environment helpers (mirrors identityFromEnv() from @lucid-agents/identity)
export { identitySolanaFromEnv, parseSolanaPrivateKey, normalizeCluster } from './env.js';

// Core init (mirrors createAgentIdentity() from @lucid-agents/identity)
export {
  createSolanaAgentIdentity,
  registerSolanaAgent,
  getSolanaTrustConfig,
} from './init.js';

// Registry clients
export {
  createSolanaIdentityRegistryClient,
  DEFAULT_IDENTITY_PROGRAM_ID,
} from './registries/identity.js';
export {
  createSolanaReputationRegistryClient,
  DEFAULT_REPUTATION_PROGRAM_ID,
} from './registries/reputation.js';

// Types
export type {
  SolanaCluster,
  SolanaIdentityRecord,
  SolanaAgentIdentity,
  CreateSolanaAgentIdentityOptions,
  SolanaRegistryClients,
  SolanaIdentityRegistryClient,
  SolanaReputationRegistryClient,
} from './types.js';

export { toRegistrationEntry, buildSolanaTrustConfig } from './types.js';
