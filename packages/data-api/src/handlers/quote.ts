import type { ChainDataProvider } from '../providers/types';
import type { QuoteRequest, QuoteResponse } from '../schemas/quote';
import { estimateGas, estimateCostUsd } from '../logic/gas-estimator';
import { buildFreshness, computeConfidence, computeVolatility } from '../logic/freshness';
import { CHAIN_CONFIGS, RECENT_BLOCKS_COUNT } from '../config';

export async function handleQuote(
  input: QuoteRequest,
  provider: ChainDataProvider,
): Promise<QuoteResponse> {
  const { chain, urgency, tx_type, recent_failure_tolerance } = input;

  const recentBlocks = await provider.getRecentBlocks(chain, RECENT_BLOCKS_COUNT);
  if (recentBlocks.length === 0) {
    throw new Error('No block data available');
  }
  const latestBlock = recentBlocks[0];

  // Collect priority fees from all recent blocks
  const recentPriorityFees = recentBlocks.flatMap(b => b.priority_fees);
  const recentBaseFees = recentBlocks.map(b => b.base_fee);

  const estimate = estimateGas({
    chain,
    urgency,
    tx_type,
    recent_failure_tolerance,
    current_base_fee: latestBlock.base_fee,
    recent_priority_fees: recentPriorityFees,
  });

  const chainConfig = CHAIN_CONFIGS[chain];
  const costUsd = estimateCostUsd(
    BigInt(estimate.recommended_max_fee),
    tx_type,
    chainConfig.native_token_price_usd,
  );

  const freshness = buildFreshness({
    fetched_at: new Date(),
    block_number: latestBlock.number,
    block_timestamp_ms: latestBlock.timestamp_ms,
    data_source: 'live',
  });

  const confidence = computeConfidence({
    sample_size: recentBlocks.length,
    base_fee_volatility: computeVolatility(recentBaseFees),
    block_age_ms: freshness.block_age_ms,
    mempool_visibility: provider.getMempoolVisibility(chain),
  });

  return {
    recommended_max_fee: estimate.recommended_max_fee,
    priority_fee: estimate.priority_fee,
    estimated_cost_usd: costUsd,
    urgency,
    chain,
    freshness,
    confidence,
  };
}
