/**
 * Create SolanaIdentityConfig from environment variables.
 * Mirrors identityFromEnv() from @lucid-agents/identity.
 */

import type { CreateSolanaAgentIdentityOptions } from './init';
import { parseBoolean, parseSolanaPrivateKey } from './validation';

export type SolanaIdentityConfig = CreateSolanaAgentIdentityOptions & {
  /** Pinata JWT for IPFS metadata upload (optional). */
  _pinataJwt?: string;
  /** Whether ATOM protocol support is enabled (optional). */
  _atomEnabled?: boolean;
};

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
  let privateKey: Uint8Array | undefined;
  if (env.SOLANA_PRIVATE_KEY !== undefined && env.SOLANA_PRIVATE_KEY !== '') {
    try {
      privateKey = parseSolanaPrivateKey(env.SOLANA_PRIVATE_KEY);
      if (!privateKey) {
        throw new Error(
          'parseSolanaPrivateKey returned undefined for a non-empty value'
        );
      }
    } catch (err) {
      throw new Error(
        `env.ts: SOLANA_PRIVATE_KEY is set but could not be parsed. ` +
          `Ensure it is a JSON array of numbers (e.g. [1,2,...,64]). ` +
          `Original error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  const cluster = env.SOLANA_CLUSTER;
  const rpcUrl = env.SOLANA_RPC_URL;
  const domain = env.AGENT_DOMAIN;
  const autoRegister =
    env.REGISTER_IDENTITY !== undefined
      ? parseBoolean(env.REGISTER_IDENTITY, true)
      : undefined;
  const pinataJwt = env.PINATA_JWT;
  const atomEnabled =
    env.ATOM_ENABLED !== undefined
      ? parseBoolean(env.ATOM_ENABLED, false)
      : undefined;

  const config: SolanaIdentityConfig = {
    env,
    ...(privateKey ? { privateKey } : {}),
    ...(cluster ? { cluster } : {}),
    ...(rpcUrl ? { rpcUrl } : {}),
    ...(domain ? { domain } : {}),
    ...(autoRegister !== undefined ? { autoRegister } : {}),
    _pinataJwt: pinataJwt,
    _atomEnabled: atomEnabled,
  };

  return config;
}
