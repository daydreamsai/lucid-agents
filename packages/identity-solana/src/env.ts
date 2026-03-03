/**
 * Create SolanaIdentityConfig from environment variables.
 * Mirrors identityFromEnv() from @lucid-agents/identity.
 */

import type { CreateSolanaAgentIdentityOptions } from './init';
import { parseBoolean, parseSolanaPrivateKey } from './validation';

export type SolanaIdentityConfig = CreateSolanaAgentIdentityOptions;

/**
 * Build a SolanaIdentityConfig from environment variables.
 *
 * @example
 * ```ts
 * import { identitySolana, identitySolanaFromEnv } from '@lucid-agents/identity-solana';
 *
 * const agent = await createAgent({ name: 'my-agent', version: '1.0.0' })
 *   .use(identitySolana({ config: identitySolanaFromEnv() }))
 *   .build();
 * ```
 */
export function identitySolanaFromEnv(
  env: Record<string, string | undefined> = typeof process !== 'undefined'
    ? process.env
    : {}
): SolanaIdentityConfig {
  const privateKey = parseSolanaPrivateKey(env.SOLANA_PRIVATE_KEY);
  const cluster = env.SOLANA_CLUSTER;
  const rpcUrl = env.SOLANA_RPC_URL;
  const domain = env.AGENT_DOMAIN;
  const autoRegister = env.REGISTER_IDENTITY !== undefined
    ? parseBoolean(env.REGISTER_IDENTITY, true)
    : undefined;
  const pinataJwt = env.PINATA_JWT;
  const atomEnabled = env.ATOM_ENABLED !== undefined
    ? parseBoolean(env.ATOM_ENABLED, false)
    : undefined;

  const config: SolanaIdentityConfig = {
    env,
    ...(privateKey ? { privateKey } : {}),
    ...(cluster ? { cluster } : {}),
    ...(rpcUrl ? { rpcUrl } : {}),
    ...(domain ? { domain } : {}),
    ...(autoRegister !== undefined ? { autoRegister } : {}),
  };

  // Attach extra fields for downstream use (PINATA_JWT, ATOM_ENABLED)
  (config as any)._pinataJwt = pinataJwt;
  (config as any)._atomEnabled = atomEnabled;

  return config;
}
