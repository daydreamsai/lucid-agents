import type { Chain, MempoolVisibility } from '../schemas/common';

export interface BlockData {
  number: number;
  timestamp_ms: number;
  base_fee: bigint;
  gas_used: bigint;
  gas_limit: bigint;
  tx_count: number;
  priority_fees: bigint[]; // sampled priority fees from txs in block
}

export interface ChainDataProvider {
  getLatestBlock(chain: Chain): Promise<BlockData>;
  getRecentBlocks(chain: Chain, count: number): Promise<BlockData[]>;
  getPendingTxCount(chain: Chain): Promise<number>;
  getMempoolVisibility(chain: Chain): MempoolVisibility;
}
