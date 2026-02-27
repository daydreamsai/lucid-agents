import { projectBaseFee } from './gas-estimator';

/**
 * Sigmoid inclusion probability model.
 *
 * projected_base = current_base_fee * (9/8)^target_block
 * effective_tip = max_fee - projected_base
 * median_tip = median(recent_priority_fees)
 *
 * If effective_tip <= 0 → P ≈ 0
 * If median_tip <= 0 → guard with 1n wei floor
 *
 * ratio = effective_tip / median_tip
 * P(block) = 1 / (1 + exp(-k * (ratio - 1)))
 */

export interface InclusionProbabilityInput {
  max_fee: bigint;
  current_base_fee: bigint;
  recent_priority_fees: bigint[];
  target_block: number;
  k?: number; // steepness, default 4
}

function median(sorted: bigint[]): bigint {
  if (sorted.length === 0) return 0n;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2n;
  }
  return sorted[mid];
}

export function inclusionProbability(input: InclusionProbabilityInput): number {
  const { max_fee, current_base_fee, recent_priority_fees, target_block, k = 4 } = input;

  // Project base fee for target block
  const projectedBase = projectBaseFee(current_base_fee, target_block);

  // Effective tip
  const effectiveTip = max_fee - projectedBase;

  // Guard: if max_fee can't cover projected base, probability ≈ 0
  if (effectiveTip <= 0n) return 0.0;

  // Compute median tip with near-zero guard
  const sorted = [...recent_priority_fees].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  let medianTip = median(sorted);
  if (medianTip <= 0n) medianTip = 1n; // 1 wei floor

  const ratio = Number(effectiveTip) / Number(medianTip);
  const p = 1 / (1 + Math.exp(-k * (ratio - 1)));

  return Math.min(1, Math.max(0, p));
}

export interface InclusionCurvePoint {
  max_fee: string;
  priority_fee: string;
  inclusion_probability: number;
  target_block: number;
}

export function buildInclusionCurve(
  maxFee: bigint,
  priorityFee: bigint,
  currentBaseFee: bigint,
  recentPriorityFees: bigint[],
  targetBlocks: number,
  k?: number,
): InclusionCurvePoint[] {
  const curve: InclusionCurvePoint[] = [];

  // Compute cumulative inclusion probability: P(included by block N) = 1 - Π(1 - p_i)
  let cumulativeMiss = 1.0;

  for (let block = 1; block <= targetBlocks; block++) {
    const perBlockProb = inclusionProbability({
      max_fee: maxFee,
      current_base_fee: currentBaseFee,
      recent_priority_fees: recentPriorityFees,
      target_block: block,
      k,
    });

    cumulativeMiss *= (1 - perBlockProb);
    const cumulativeProb = 1 - cumulativeMiss;

    curve.push({
      max_fee: maxFee.toString(),
      priority_fee: priorityFee.toString(),
      inclusion_probability: Math.round(Math.min(1, Math.max(0, cumulativeProb)) * 1000) / 1000,
      target_block: block,
    });
  }

  return curve;
}
