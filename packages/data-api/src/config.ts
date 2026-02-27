import type { Chain } from './schemas/common';

export interface ChainConfig {
  name: string;
  block_time_ms: number;
  cache_ttl_ms: number;
  eth_price_usd: number; // mock price for cost estimation
}

export const CHAIN_CONFIGS: Record<Chain, ChainConfig> = {
  ethereum: { name: 'Ethereum Mainnet', block_time_ms: 12_000, cache_ttl_ms: 12_000, eth_price_usd: 3000 },
  base:     { name: 'Base',             block_time_ms: 2_000,  cache_ttl_ms: 2_000,  eth_price_usd: 3000 },
  optimism: { name: 'Optimism',         block_time_ms: 2_000,  cache_ttl_ms: 2_000,  eth_price_usd: 3000 },
  arbitrum: { name: 'Arbitrum One',     block_time_ms: 250,    cache_ttl_ms: 2_000,  eth_price_usd: 3000 },
  polygon:  { name: 'Polygon PoS',      block_time_ms: 2_000,  cache_ttl_ms: 2_000,  eth_price_usd: 0.5 },
};

export const PRICING = {
  'gas-quote': '0.01',
  'gas-forecast': '0.02',
  'gas-congestion': '0.005',
} as const;

export const RECENT_BLOCKS_COUNT = 20;
export const STALE_THRESHOLD_MS = 30_000;

export const DEFAULT_PORT = 3000;
