import type { CongestionRequest, CongestionResponse } from '../schemas/congestion';
import type { ChainDataProvider } from '../providers/types';
import { classifyCongestion, type BlockStats } from '../logic/congestion-detector';
import { buildFreshness, computeConfidence } from '../logic/freshness';
import { RECENT_BLOCKS_COUNT } from '../config';

export async function handleCongestion(
  input: CongestionRequest,
  provider: ChainDataProvider,
): Promise<CongestionResponse> {
  const { chain } = input;

  const recentBlocks = await provider.getRecentBlocks(chain, RECENT_BLOCKS_COUNT);
  if (recentBlocks.length === 0) {
    throw new Error('No block data available');
  }
  const latestBlock = recentBlocks[0]; // provider returns newest-first
  const pendingTxCount = await provider.getPendingTxCount(chain);
  const mempoolVisibility = provider.getMempoolVisibility(chain);

  const blockStat: BlockStats = {
    gas_used: latestBlock.gas_used,
    gas_limit: latestBlock.gas_limit,
    base_fee: latestBlock.base_fee,
    tx_count: latestBlock.tx_count,
  };

  const recentBaseFees = recentBlocks.map(b => b.base_fee);

  const result = classifyCongestion(blockStat, recentBaseFees, chain, mempoolVisibility, pendingTxCount);

  // Volatility from base fees
  const feeNumbers = recentBaseFees.map(f => Number(f));
  const avg = feeNumbers.reduce((a, b) => a + b, 0) / (feeNumbers.length || 1);
  const variance = feeNumbers.reduce((sum, f) => sum + (f - avg) ** 2, 0) / (feeNumbers.length || 1);
  const volatility = avg > 0 ? Math.min(1, Math.sqrt(variance) / avg) : 0;

  const freshness = buildFreshness({
    fetched_at: new Date(),
    block_number: latestBlock.number,
    block_timestamp_ms: latestBlock.timestamp_ms,
    data_source: 'live',
  });

  const confidence = computeConfidence({
    sample_size: recentBlocks.length,
    base_fee_volatility: volatility,
    block_age_ms: freshness.block_age_ms,
    mempool_available: mempoolVisibility !== 'none',
  });

  return {
    chain,
    ...result,
    freshness,
    confidence,
  };
}
