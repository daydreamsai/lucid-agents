/**
 * Minimal RPC helpers that wrap the JSON-RPC calls needed by the gas oracle.
 * Supports Ethereum-compatible chains via any standard HTTP RPC endpoint.
 */

export type BlockData = {
  baseFeePerGas: bigint | null;
  gasUsed: bigint;
  gasLimit: bigint;
  number: bigint;
  timestamp: bigint;
};

export type MempoolStatus = {
  pendingTxCount: number;
};

async function rpcCall(rpcUrl: string, method: string, params: unknown[] = []) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`RPC error: ${json.error.message}`);
  return json.result;
}

function hexToBigInt(hex: string): bigint {
  return BigInt(hex);
}

export async function getLatestBlock(rpcUrl: string): Promise<BlockData> {
  const raw = (await rpcCall(rpcUrl, 'eth_getBlockByNumber', [
    'latest',
    false,
  ])) as Record<string, string> | null;

  if (!raw) throw new Error('Failed to fetch latest block');

  return {
    baseFeePerGas: raw.baseFeePerGas ? hexToBigInt(raw.baseFeePerGas) : null,
    gasUsed: hexToBigInt(raw.gasUsed),
    gasLimit: hexToBigInt(raw.gasLimit),
    number: hexToBigInt(raw.number),
    timestamp: hexToBigInt(raw.timestamp),
  };
}

export async function getMempoolStatus(rpcUrl: string): Promise<MempoolStatus> {
  try {
    const raw = (await rpcCall(rpcUrl, 'txpool_status', [])) as {
      pending?: string;
      queued?: string;
    } | null;
    const pending = raw?.pending ? parseInt(raw.pending, 16) : 0;
    const queued = raw?.queued ? parseInt(raw.queued, 16) : 0;
    return { pendingTxCount: pending + queued };
  } catch {
    // txpool_status is not universally supported; fall back to 0
    return { pendingTxCount: 0 };
  }
}

/**
 * Resolve the RPC URL for a given chain identifier.
 * Prefers env vars, then falls back to public endpoints.
 */
export function resolveRpcUrl(chain: string): string {
  const envKey = `RPC_URL_${chain.toUpperCase().replace(/-/g, '_')}`;
  const fromEnv = process.env[envKey] ?? process.env.RPC_URL;
  if (fromEnv) return fromEnv;

  const defaults: Record<string, string> = {
    ethereum: 'https://eth.llamarpc.com',
    mainnet: 'https://eth.llamarpc.com',
    'eth-mainnet': 'https://eth.llamarpc.com',
    polygon: 'https://polygon.llamarpc.com',
    arbitrum: 'https://arbitrum.llamarpc.com',
    optimism: 'https://optimism.llamarpc.com',
    base: 'https://base.llamarpc.com',
  };

  const rpcUrl = defaults[chain.toLowerCase()];
  if (!rpcUrl) throw new Error(`Unknown chain "${chain}". Set RPC_URL_${chain.toUpperCase()} env var.`);
  return rpcUrl;
}
