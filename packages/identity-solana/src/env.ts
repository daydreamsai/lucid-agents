import type { SolanaCluster, SolanaIdentityConfig } from './types.js';

/**
 * Parses SOLANA_PRIVATE_KEY environment variable.
 * Accepts JSON array of bytes, e.g.: [1,2,3,...,64]
 * Returns a Uint8Array of the secret key, or undefined if not set.
 */
export function parseSolanaPrivateKey(
  raw: string | undefined
): Uint8Array | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('SOLANA_PRIVATE_KEY must be a JSON array of bytes');
    }
    return Uint8Array.from(parsed);
  } catch (err) {
    throw new Error(
      `[identity-solana] Failed to parse SOLANA_PRIVATE_KEY: ${
        err instanceof Error ? err.message : String(err)
      }. ` +
        'Expected a JSON array of bytes, e.g. [1,2,...,64] ' +
        '(output of solana-keygen to JSON format).'
    );
  }
}

/**
 * Normalizes a cluster string to one of the known cluster types.
 */
export function normalizeCluster(
  cluster: string | undefined
): SolanaCluster {
  if (!cluster) return 'mainnet-beta';
  const c = cluster.toLowerCase().trim();
  if (c === 'mainnet' || c === 'mainnet-beta') return 'mainnet-beta';
  if (c === 'devnet') return 'devnet';
  if (c === 'testnet') return 'testnet';
  // Return as-is for custom cluster URLs or identifiers
  return c as SolanaCluster;
}

/**
 * Creates a SolanaIdentityConfig from environment variables.
 *
 * Reads from:
 * - AGENT_DOMAIN             → domain
 * - REGISTER_IDENTITY        → autoRegister
 * - SOLANA_CLUSTER           → cluster (default: mainnet-beta)
 * - SOLANA_RPC_URL           → rpcUrl
 * - SOLANA_PRIVATE_KEY       → (used by createSolanaAgentIdentity)
 *
 * @param overrides Optional config overrides applied on top of env
 */
export function identitySolanaFromEnv(
  overrides?: Partial<SolanaIdentityConfig>
): SolanaIdentityConfig {
  const env =
    typeof process !== 'undefined'
      ? process.env
      : ({} as Record<string, string | undefined>);

  const domain = overrides?.domain ?? env.AGENT_DOMAIN;
  const rpcUrl = overrides?.rpcUrl ?? env.SOLANA_RPC_URL;
  const cluster =
    overrides?.cluster ??
    normalizeCluster(env.SOLANA_CLUSTER ?? env.SOLANA_CLUSTER_URL);

  let autoRegister: boolean | undefined = overrides?.autoRegister;
  if (autoRegister === undefined) {
    const raw = env.REGISTER_IDENTITY ?? env.IDENTITY_AUTO_REGISTER;
    if (raw !== undefined) {
      autoRegister = raw.toLowerCase() === 'true' || raw === '1';
    }
  }

  return {
    trust: overrides?.trust,
    domain,
    autoRegister,
    cluster,
    rpcUrl,
    skipSend: overrides?.skipSend,
  };
}
