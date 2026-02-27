import { createPublicClient, http, type Chain as ViemChain } from 'viem';
import { mainnet, base, arbitrum, optimism, polygon } from 'viem/chains';
import type { Chain, GasDataProvider } from './core';

const CHAIN_MAP: Record<Chain, ViemChain> = {
  ethereum: mainnet,
  base: base,
  arbitrum: arbitrum,
  optimism: optimism,
  polygon: polygon,
};

type MockDataValue = bigint | number;

/**
 * Mock gas data provider for testing
 */
export class MockGasDataProvider implements GasDataProvider {
  private mockData: Map<string, MockDataValue> = new Map();

  setMockData(key: string, value: MockDataValue): void {
    this.mockData.set(key, value);
  }

  async getCurrentBaseFee(chain: Chain): Promise<bigint> {
    const key = `baseFee:${chain}`;
    return this.mockData.get(key) ?? BigInt(30e9);
  }

  async getPriorityFee(chain: Chain): Promise<bigint> {
    const key = `priorityFee:${chain}`;
    return this.mockData.get(key) ?? BigInt(2e9);
  }

  async getPendingTxCount(chain: Chain): Promise<number> {
    const key = `pendingTx:${chain}`;
    return this.mockData.get(key) ?? 5000;
  }

  async getBlockUtilization(chain: Chain): Promise<number> {
    const key = `utilization:${chain}`;
    return this.mockData.get(key) ?? 0.6;
  }

  async getCurrentBlock(chain: Chain): Promise<number> {
    const key = `currentBlock:${chain}`;
    return this.mockData.get(key) ?? 18000000;
  }
}

/**
 * Real gas data provider using viem
 */
export class ViemGasDataProvider implements GasDataProvider {
  private clients: Map<Chain, ReturnType<typeof createPublicClient>> = new Map();
  private cache: Map<string, { value: any; timestamp: number }> = new Map();
  private cacheTTL = 5000; // 5 seconds

  constructor(rpcUrls?: Partial<Record<Chain, string>>) {
    for (const [chain, viemChain] of Object.entries(CHAIN_MAP)) {
      const rpcUrl = rpcUrls?.[chain as Chain];
      this.clients.set(
        chain as Chain,
        createPublicClient({
          chain: viemChain,
          transport: http(rpcUrl),
        })
      );
    }
  }

  private getCached<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    const age = Date.now() - cached.timestamp;
    if (age > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.value as T;
  }

  private setCache(key: string, value: any): void {
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  async getCurrentBaseFee(chain: Chain): Promise<bigint> {
    const cacheKey = `baseFee:${chain}`;
    const cached = this.getCached<bigint>(cacheKey);
    if (cached !== null) return cached;

    const client = this.clients.get(chain);
    if (!client) throw new Error(`No client for chain: ${chain}`);

    const block = await client.getBlock({ blockTag: 'latest' });
    const baseFee = block.baseFeePerGas ?? BigInt(0);
    
    this.setCache(cacheKey, baseFee);
    return baseFee;
  }

  async getPriorityFee(chain: Chain): Promise<bigint> {
    const cacheKey = `priorityFee:${chain}`;
    const cached = this.getCached<bigint>(cacheKey);
    if (cached !== null) return cached;

    const client = this.clients.get(chain);
    if (!client) throw new Error(`No client for chain: ${chain}`);

    const feeHistory = await client.getFeeHistory({
      blockCount: 10,
      rewardPercentiles: [50],
    });

    // Calculate median priority fee from recent blocks
    const rewards = feeHistory.reward?.map(r => r[0] ?? BigInt(0)) ?? [];
    const sorted = rewards.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const median = sorted[Math.floor(sorted.length / 2)] ?? BigInt(1e9);
    
    this.setCache(cacheKey, median);
    return median;
  }

  async getPendingTxCount(chain: Chain): Promise<number> {
    const cacheKey = `pendingTx:${chain}`;
    const cached = this.getCached<number>(cacheKey);
    if (cached !== null) return cached;

    // Note: Most RPC providers don't expose pending tx count
    // This is a placeholder - in production, use a specialized service
    const count = 5000; // Default estimate
    
    this.setCache(cacheKey, count);
    return count;
  }

  async getBlockUtilization(chain: Chain): Promise<number> {
    const cacheKey = `utilization:${chain}`;
    const cached = this.getCached<number>(cacheKey);
    if (cached !== null) return cached;

    const client = this.clients.get(chain);
    if (!client) throw new Error(`No client for chain: ${chain}`);

    const block = await client.getBlock({ blockTag: 'latest' });
    const gasUsed = Number(block.gasUsed);
    const gasLimit = Number(block.gasLimit);
    const utilization = gasLimit > 0 ? gasUsed / gasLimit : 0;
    
    this.setCache(cacheKey, utilization);
    return utilization;
  }

  async getCurrentBlock(chain: Chain): Promise<number> {
    const cacheKey = `currentBlock:${chain}`;
    const cached = this.getCached<number>(cacheKey);
    if (cached !== null) return cached;

    const client = this.clients.get(chain);
    if (!client) throw new Error(`No client for chain: ${chain}`);

    const blockNumber = await client.getBlockNumber();
    const block = Number(blockNumber);
    
    this.setCache(cacheKey, block);
    return block;
  }

  /**
   * Get cache freshness in milliseconds
   */
  getCacheFreshness(chain: Chain, dataType: string): number {
    const cacheKey = `${dataType}:${chain}`;
    const cached = this.cache.get(cacheKey);
    if (!cached) return Infinity;
    
    return Date.now() - cached.timestamp;
  }
}
