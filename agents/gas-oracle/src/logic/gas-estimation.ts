import type { Urgency } from '../schemas/index.js';
import type { InclusionProbabilityPoint } from '../schemas/index.js';

export type BaseFeeWei = bigint;

/**
 * Urgency multipliers applied to base_fee to derive max_fee suggestion.
 */
const URGENCY_MULTIPLIERS: Record<Urgency, number> = {
  low: 1.05,
  medium: 1.15,
  high: 1.35,
  urgent: 1.75,
};

/**
 * Priority fee tips (in Gwei) by urgency level.
 */
const PRIORITY_FEE_GWEI: Record<Urgency, number> = {
  low: 0.5,
  medium: 1.5,
  high: 3.0,
  urgent: 8.0,
};

const GWEI = 1_000_000_000n;

export function estimateFees(baseFeeWei: bigint, urgency: Urgency): {
  recommendedMaxFeeWei: bigint;
  priorityFeeWei: bigint;
} {
  const multiplier = URGENCY_MULTIPLIERS[urgency];
  const priorityGwei = PRIORITY_FEE_GWEI[urgency];

  // recommended max fee = base_fee * multiplier + priority_fee
  const priorityFeeWei = BigInt(Math.round(priorityGwei * 1e9));
  const recommendedMaxFeeWei =
    BigInt(Math.round(Number(baseFeeWei) * multiplier)) + priorityFeeWei;

  return { recommendedMaxFeeWei, priorityFeeWei };
}

/**
 * Build an inclusion probability curve across N block horizons.
 * Model: P(inclusion within k blocks) = 1 - exp(-k * lambda)
 * where lambda depends on urgency.
 */
const LAMBDA: Record<Urgency, number> = {
  low: 0.05,
  medium: 0.15,
  high: 0.35,
  urgent: 0.80,
};

export function buildInclusionCurve(
  urgency: Urgency,
  maxBlocks = 20
): InclusionProbabilityPoint[] {
  const lambda = LAMBDA[urgency];
  const curve: InclusionProbabilityPoint[] = [];
  for (let blocks = 1; blocks <= maxBlocks; blocks++) {
    curve.push({
      blocks,
      probability: parseFloat((1 - Math.exp(-blocks * lambda)).toFixed(4)),
    });
  }
  return curve;
}

/**
 * Estimate wait time in seconds based on urgency (12s avg block time on mainnet).
 */
export function estimateWaitSeconds(urgency: Urgency, avgBlockSeconds = 12): number {
  const targetBlocks: Record<Urgency, number> = {
    low: 20,
    medium: 6,
    high: 2,
    urgent: 1,
  };
  return targetBlocks[urgency] * avgBlockSeconds;
}

/**
 * Build a simple linear base-fee forecast.
 * In production this would be replaced by an ML model or EIP-1559 history.
 */
export function buildForecast(
  currentBaseFeeGwei: number,
  horizonMinutes: number,
  granularityMinutes: number,
  now = Date.now()
): Array<{ timestamp_ms: number; base_fee_gwei: number; confidence_score: number }> {
  const steps = Math.ceil(horizonMinutes / granularityMinutes);
  const result = [];

  for (let i = 1; i <= steps; i++) {
    const minutesAhead = i * granularityMinutes;
    // Naive model: slight random walk bounded by ±20% of current base fee
    const jitter = (Math.random() - 0.5) * 0.05 * currentBaseFeeGwei;
    const base_fee_gwei = Math.max(0.1, currentBaseFeeGwei + jitter);
    // Confidence degrades linearly from 0.95 at t=0 to 0.50 at horizon
    const confidence_score = parseFloat(
      (0.95 - (0.45 * minutesAhead) / horizonMinutes).toFixed(3)
    );
    result.push({
      timestamp_ms: now + minutesAhead * 60_000,
      base_fee_gwei: parseFloat(base_fee_gwei.toFixed(4)),
      confidence_score,
    });
  }

  return result;
}
