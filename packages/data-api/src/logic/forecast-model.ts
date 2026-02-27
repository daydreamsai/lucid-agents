import type { Chain } from '../schemas/common';
import { estimateGas } from './gas-estimator';
import { buildInclusionCurve, type InclusionCurvePoint } from './probability';
import { computeBaseFeeTrend } from './congestion-detector';

export interface ForecastInput {
  chain: Chain;
  target_blocks: number;
  current_base_fee: bigint;
  recent_base_fees: bigint[];
  recent_priority_fees: bigint[];
}

export interface ForecastOutput {
  inclusion_probability_curve: InclusionCurvePoint[];
  forecast_horizon_blocks: number;
  trend: 'rising' | 'falling' | 'stable';
}

export function buildForecast(input: ForecastInput): ForecastOutput {
  const { chain, target_blocks, current_base_fee, recent_base_fees, recent_priority_fees } = input;

  // Estimate a "medium" urgency gas quote to use as max_fee for the curve
  const estimate = estimateGas({
    chain,
    urgency: 'medium',
    tx_type: 'transfer',
    recent_failure_tolerance: 0.05,
    current_base_fee,
    recent_priority_fees,
  });

  const maxFee = BigInt(estimate.recommended_max_fee);
  const priorityFee = BigInt(estimate.priority_fee);

  // Build inclusion probability curve
  const curve = buildInclusionCurve(
    maxFee,
    priorityFee,
    current_base_fee,
    recent_priority_fees,
    target_blocks,
  );

  // Detect trend from recent base fees
  const trend = computeBaseFeeTrend(recent_base_fees);

  return {
    inclusion_probability_curve: curve,
    forecast_horizon_blocks: target_blocks,
    trend,
  };
}
