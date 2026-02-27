import type { Chain, MempoolVisibility } from '../schemas/common';
import type { ChainDataProvider, BlockData } from './types';

interface ChainProfile {
  avg_base_fee: bigint;
  avg_util: number;
  block_time: number;
  mempool: MempoolVisibility;
  pending_tx_base: number;
}

const CHAIN_PROFILES: Record<Chain, ChainProfile> = {
  ethereum: { avg_base_fee: 30_000_000_000n, avg_util: 0.55, block_time: 12, mempool: 'partial', pending_tx_base: 18000 },
  base:     { avg_base_fee: 100_000n,        avg_util: 0.40, block_time: 2,  mempool: 'none',    pending_tx_base: 500 },
  optimism: { avg_base_fee: 1_000_000n,      avg_util: 0.35, block_time: 2,  mempool: 'none',    pending_tx_base: 300 },
  arbitrum: { avg_base_fee: 100_000_000n,     avg_util: 0.45, block_time: 0.25, mempool: 'none',  pending_tx_base: 1000 },
  polygon:  { avg_base_fee: 50_000_000_000n,  avg_util: 0.60, block_time: 2, mempool: 'partial',  pending_tx_base: 8000 },
};

type Scenario = 'normal' | 'high_congestion' | 'low_congestion' | 'volatile';

/**
 * Simple seeded PRNG (mulberry32) for deterministic mock data.
 */
function createRng(seed: number) {
  let s = seed | 0;
  return (): number => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MockProvider implements ChainDataProvider {
  private seed: number;
  private scenario: Scenario = 'normal';

  constructor(seed: number = 42) {
    this.seed = seed;
  }

  setScenario(scenario: Scenario): void {
    this.scenario = scenario;
  }

  private getScenarioMultipliers(): { feeMultiplier: number; utilMultiplier: number } {
    switch (this.scenario) {
      case 'high_congestion': return { feeMultiplier: 3.0, utilMultiplier: 1.8 };
      case 'low_congestion': return { feeMultiplier: 0.3, utilMultiplier: 0.4 };
      case 'volatile': return { feeMultiplier: 1.5, utilMultiplier: 1.0 };
      default: return { feeMultiplier: 1.0, utilMultiplier: 1.0 };
    }
  }

  private generateBlock(chain: Chain, blockOffset: number): BlockData {
    const profile = CHAIN_PROFILES[chain];
    const rng = createRng(this.seed + blockOffset * 1000 + chain.length);
    const { feeMultiplier, utilMultiplier } = this.getScenarioMultipliers();

    // Base fee with some variance (±20%)
    const variance = 0.8 + rng() * 0.4; // 0.8 to 1.2
    const baseFee = BigInt(Math.round(Number(profile.avg_base_fee) * variance * feeMultiplier));

    // Gas utilization
    const util = Math.min(1.0, profile.avg_util * utilMultiplier * (0.85 + rng() * 0.3));
    const gasLimit = 30_000_000n;
    const gasUsed = BigInt(Math.round(Number(gasLimit) * util));

    // Priority fees (5 samples per block)
    const priorityFees: bigint[] = [];
    const basePriority = Number(profile.avg_base_fee) / 10;
    for (let i = 0; i < 5; i++) {
      const fee = BigInt(Math.max(1, Math.round(basePriority * (0.5 + rng() * 1.5))));
      priorityFees.push(fee);
    }

    const now = Date.now();
    const txCount = Math.round(150 * util * (0.8 + rng() * 0.4));

    return {
      number: 19_500_000 - blockOffset,
      timestamp_ms: now - blockOffset * profile.block_time * 1000,
      base_fee: baseFee,
      gas_used: gasUsed,
      gas_limit: gasLimit,
      tx_count: txCount,
      priority_fees: priorityFees,
    };
  }

  async getLatestBlock(chain: Chain): Promise<BlockData> {
    return this.generateBlock(chain, 0);
  }

  async getRecentBlocks(chain: Chain, count: number): Promise<BlockData[]> {
    const blocks: BlockData[] = [];
    for (let i = 0; i < count; i++) {
      blocks.push(this.generateBlock(chain, i));
    }
    return blocks;
  }

  async getPendingTxCount(chain: Chain): Promise<number> {
    const profile = CHAIN_PROFILES[chain];
    const rng = createRng(this.seed + 999);
    const { utilMultiplier } = this.getScenarioMultipliers();
    return Math.round(profile.pending_tx_base * utilMultiplier * (0.8 + rng() * 0.4));
  }

  getMempoolVisibility(chain: Chain): MempoolVisibility {
    return CHAIN_PROFILES[chain].mempool;
  }
}

/**
 * A provider that always fails — for testing fallback behavior.
 */
export class FailingMockProvider implements ChainDataProvider {
  async getLatestBlock(): Promise<BlockData> {
    throw new Error('Provider connection failed');
  }
  async getRecentBlocks(): Promise<BlockData[]> {
    throw new Error('Provider connection failed');
  }
  async getPendingTxCount(): Promise<number> {
    throw new Error('Provider connection failed');
  }
  getMempoolVisibility(): MempoolVisibility {
    return 'none';
  }
}
