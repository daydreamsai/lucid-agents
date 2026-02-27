import type { Chain, Urgency, TxType } from '../schemas/common';
import { URGENCY_BLOCK_TARGETS, URGENCY_TIP_PERCENTILES } from '../schemas/common';

export interface GasEstimateInput {
  chain: Chain;
  urgency: Urgency;
  tx_type: TxType;
  recent_failure_tolerance: number;
  current_base_fee: bigint;
  recent_priority_fees: bigint[];
}

export interface GasEstimateOutput {
  recommended_max_fee: string;
  priority_fee: string;
}

// Gas overhead multipliers by tx type
const TX_TYPE_GAS_MULTIPLIER: Record<TxType, number> = {
  transfer: 1.0,
  erc20_transfer: 1.2,
  swap: 2.5,
  contract_call: 1.8,
};

/**
 * Compute base_fee * (9/8)^n using BigInt arithmetic.
 * Each step: fee = fee * 9n / 8n
 */
export function projectBaseFee(currentBaseFee: bigint, blocks: number): bigint {
  let fee = currentBaseFee;
  for (let i = 0; i < blocks; i++) {
    fee = (fee * 9n) / 8n;
  }
  return fee;
}

/**
 * Pick a percentile value from a sorted array of bigints.
 */
function percentile(sorted: bigint[], pct: number): bigint {
  if (sorted.length === 0) return 0n;
  const idx = Math.min(
    Math.floor((pct / 100) * sorted.length),
    sorted.length - 1,
  );
  return sorted[idx];
}

export function estimateGas(input: GasEstimateInput): GasEstimateOutput {
  const { urgency, recent_failure_tolerance, current_base_fee, recent_priority_fees } = input;

  // 1. Block target from urgency
  const n = URGENCY_BLOCK_TARGETS[urgency];

  // 2. Project max base fee n blocks ahead: base_fee * (9/8)^n
  const projectedBaseFee = projectBaseFee(current_base_fee, n);

  // 3. Priority fee from percentile
  const sorted = [...recent_priority_fees].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const pct = URGENCY_TIP_PERCENTILES[urgency];
  let tipFee = percentile(sorted, pct);

  // 4. Failure tolerance adjustment: lower tolerance → higher fee
  // Default tolerance is 0.05. Multiplier = 1 + (0.05 - tolerance) * 4
  const toleranceMultiplier = 1 + (0.05 - recent_failure_tolerance) * 4;
  const adjustedTip = BigInt(Math.max(1, Math.round(Number(tipFee) * toleranceMultiplier)));

  // 5. recommended_max_fee = projected base fee + adjusted priority fee
  const recommendedMaxFee = projectedBaseFee + adjustedTip;

  return {
    recommended_max_fee: recommendedMaxFee.toString(),
    priority_fee: adjustedTip.toString(),
  };
}

/**
 * Estimate USD cost given gas estimate and tx type.
 */
export function estimateCostUsd(
  maxFeeWei: bigint,
  txType: TxType,
  ethPriceUsd: number,
): number {
  const baseGas = 21000;
  const gasUnits = Math.round(baseGas * TX_TYPE_GAS_MULTIPLIER[txType]);
  const costWei = maxFeeWei * BigInt(gasUnits);
  const costEth = Number(costWei) / 1e18;
  return Math.round(costEth * ethPriceUsd * 100) / 100;
}
