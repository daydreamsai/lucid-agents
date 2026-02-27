import type { ChainDataProvider } from '../providers/types';
import type { ForecastRequest, ForecastResponse } from '../schemas/forecast';
import { buildForecast } from '../logic/forecast-model';
import { buildFreshness, computeConfidence, computeVolatility } from '../logic/freshness';
import { RECENT_BLOCKS_COUNT } from '../config';

export async function handleForecast(
  input: ForecastRequest,
  provider: ChainDataProvider,
): Promise<ForecastResponse> {
  const { chain, target_blocks } = input;

  const recentBlocks = await provider.getRecentBlocks(chain, RECENT_BLOCKS_COUNT);
  if (recentBlocks.length === 0) {
    throw new Error('No block data available');
  }
  const latestBlock = recentBlocks[0];

  const recentBaseFees = recentBlocks.map(b => b.base_fee);
  const recentPriorityFees = recentBlocks.flatMap(b => b.priority_fees);

  const forecast = buildForecast({
    chain,
    target_blocks,
    current_base_fee: latestBlock.base_fee,
    recent_base_fees: recentBaseFees,
    recent_priority_fees: recentPriorityFees,
  });

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
    chain,
    inclusion_probability_curve: forecast.inclusion_probability_curve,
    forecast_horizon_blocks: forecast.forecast_horizon_blocks,
    trend: forecast.trend,
    freshness,
    confidence,
  };
}
