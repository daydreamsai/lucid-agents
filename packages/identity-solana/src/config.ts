/**
 * Solana cluster and RPC configuration for 8004-Solana identity.
 */

export type SolanaCluster = 'mainnet-beta' | 'devnet' | 'testnet' | 'localnet';

export const CLUSTER_RPC_URLS: Record<SolanaCluster, string> = {
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
  devnet: 'https://api.devnet.solana.com',
  testnet: 'https://api.testnet.solana.com',
  localnet: 'http://127.0.0.1:8899',
};

export const SOLANA_REGISTRATION_TYPE_V1 =
  'https://8004-solana.io/registry#registration-v1' as const;

/**
 * Resolve RPC URL from cluster name or explicit override.
 */
export function resolveRpcUrl(
  cluster: SolanaCluster = 'mainnet-beta',
  rpcUrlOverride?: string
): string {
  if (rpcUrlOverride) return rpcUrlOverride;
  return CLUSTER_RPC_URLS[cluster] ?? CLUSTER_RPC_URLS['mainnet-beta'];
}

/**
 * Parse cluster from string, defaulting to mainnet-beta when unset.
 * Throws a descriptive error when a value is provided but not a valid SolanaCluster.
 */
export function parseCluster(raw: string | undefined): SolanaCluster {
  const valid: SolanaCluster[] = [
    'mainnet-beta',
    'devnet',
    'testnet',
    'localnet',
  ];
  if (raw === undefined) {
    return 'mainnet-beta';
  }
  if (valid.includes(raw as SolanaCluster)) {
    return raw as SolanaCluster;
  }
  throw new Error(
    `parseCluster: invalid SOLANA_CLUSTER value "${raw}". Allowed values: ${valid.join(', ')}.`
  );
}
