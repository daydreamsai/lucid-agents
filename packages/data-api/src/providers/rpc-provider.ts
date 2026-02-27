import type { Chain, MempoolVisibility } from '../schemas/common';
import type { ChainDataProvider, BlockData } from './types';

/**
 * Stub RPC provider for future use with real chain data.
 * Not implemented — use MockProvider for development and testing.
 */
export class RpcProvider implements ChainDataProvider {
  async getLatestBlock(_chain: Chain): Promise<BlockData> {
    throw new Error('RpcProvider not implemented. Use MockProvider for testing.');
  }

  async getRecentBlocks(_chain: Chain, _count: number): Promise<BlockData[]> {
    throw new Error('RpcProvider not implemented. Use MockProvider for testing.');
  }

  async getPendingTxCount(_chain: Chain): Promise<number> {
    throw new Error('RpcProvider not implemented. Use MockProvider for testing.');
  }

  getMempoolVisibility(_chain: Chain): MempoolVisibility {
    return 'none';
  }
}
