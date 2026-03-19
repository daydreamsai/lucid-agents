import type { Chain, MempoolVisibility } from '../schemas/common';

export interface BlockStats {
  gas_used: bigint;
  gas_limit: bigint;
  base_fee: bigint;
  tx_count: number;
}

export interface CongestionThresholds {
  low_max: number;
  moderate_max: number;
  high_max: number;
}

export const CHAIN_CONGESTION_THRESHOLDS: Record<Chain, CongestionThresholds> = {
  ethereum: { low_max: 50, moderate_max: 75, high_max: 95 },
  base: { low_max: 40, moderate_max: 65, high_max: 90 },
  optimism: { low_max: 40, moderate_max: 65, high_max: 90 },
  arbitrum: { low_max: 45, moderate_max: 70, high_max: 92 },
  polygon: { low_max: 55, moderate_max: 78, high_max: 95 },
};

export type CongestionState = 'low' | 'moderate' | 'high' | 'extreme';
export type BaseFeeTrend = 'rising' | 'falling' | 'stable';
export type RecommendedAction = 'proceed' | 'wait' | 'urgent_only';

export interface CongestionResult {
  congestion_state: CongestionState;
  gas_utilization_pct: number;
  pending_tx_count: number;
  base_fee: string;
  base_fee_trend: BaseFeeTrend;
  recommended_action: RecommendedAction;
  mempool_visibility: MempoolVisibility;
}

/**
 * Classify congestion state from utilization percentage using chain-specific thresholds.
 */
function classifyState(utilization: number, chain: Chain): CongestionState {
  const t = CHAIN_CONGESTION_THRESHOLDS[chain];
  if (utilization < t.low_max) return 'low';
  if (utilization < t.moderate_max) return 'moderate';
  if (utilization < t.high_max) return 'high';
  return 'extreme';
}

/**
 * Compute 20-block exponential moving average of base fees.
 */
export function computeEMA(baseFees: bigint[], window: number = 20): number {
  if (baseFees.length === 0) return 0;
  const alpha = 2 / (window + 1);
  let ema = Number(baseFees[0]);
  for (let i = 1; i < baseFees.length; i++) {
    ema = alpha * Number(baseFees[i]) + (1 - alpha) * ema;
  }
  return ema;
}

/**
 * Determine base fee trend by comparing current base fee to EMA.
 */
function detectTrend(currentBaseFee: bigint, ema: number): BaseFeeTrend {
  if (ema === 0) return 'stable';
  const current = Number(currentBaseFee);
  const ratio = current / ema;
  if (ratio > 1.05) return 'rising';
  if (ratio < 0.95) return 'falling';
  return 'stable';
}

/**
 * Compute base fee trend from an array of recent base fees.
 * Uses 20-block EMA and compares the last fee to it.
 */
export function computeBaseFeeTrend(baseFees: bigint[]): BaseFeeTrend {
  if (baseFees.length === 0) return 'stable';
  const ema = computeEMA(baseFees);
  const current = baseFees[baseFees.length - 1];
  return detectTrend(current, ema);
}

function getAction(state: CongestionState): RecommendedAction {
  switch (state) {
    case 'low':
    case 'moderate':
      return 'proceed';
    case 'high':
      return 'wait';
    case 'extreme':
      return 'urgent_only';
  }
}

/**
 * Full congestion detection from a single block snapshot + recent base fees.
 */
export function classifyCongestion(
  block: BlockStats,
  recentBaseFees: bigint[],
  chain: Chain,
  mempoolVisibility: MempoolVisibility,
  pendingTxCount: number = 0,
): CongestionResult {
  const utilization = block.gas_limit > 0n
    ? Number((block.gas_used * 10000n) / block.gas_limit) / 100
    : 0;

  const trend = computeBaseFeeTrend(recentBaseFees);
  const state = classifyState(utilization, chain);
  const action = getAction(state);

  return {
    congestion_state: state,
    gas_utilization_pct: Math.round(utilization * 100) / 100,
    pending_tx_count: pendingTxCount,
    base_fee: block.base_fee.toString(),
    base_fee_trend: trend,
    recommended_action: action,
    mempool_visibility: mempoolVisibility,
  };
}
