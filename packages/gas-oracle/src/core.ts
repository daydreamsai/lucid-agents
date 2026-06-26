import type {
  Chain,
  Urgency,
  TxType,
  GasQuoteResponse,
  GasForecastResponse,
  GasCongestionResponse,
  CongestionState,
} from './schemas';

/**
 * Gas data provider interface
 */
export interface GasDataProvider {
  getCurrentBaseFee(chain: Chain): Promise<bigint>;
  getPriorityFee(chain: Chain): Promise<bigint>;
  getPendingTxCount(chain: Chain): Promise<number>;
  getBlockUtilization(chain: Chain): Promise<number>;
  getCurrentBlock(chain: Chain): Promise<number>;
}

/**
 * Calculate inclusion probability based on fee and urgency
 */
export function calculateInclusionProbability(
  baseFee: bigint,
  priorityFee: bigint,
  urgency: Urgency,
  blocks: number
): number {
  // Base probability from fee ratio
  const feeRatio = Number(priorityFee) / Number(baseFee);
  let baseProbability = Math.min(0.5 + feeRatio * 0.3, 0.95);

  // Urgency multiplier
  const urgencyMultipliers: Record<Urgency, number> = {
    low: 0.7,
    medium: 1.0,
    high: 1.2,
    urgent: 1.5,
  };
  baseProbability *= urgencyMultipliers[urgency];

  // Time decay - probability increases with more blocks
  const timeBoost = 1 - Math.exp(-blocks / 3);
  const finalProbability = baseProbability + (1 - baseProbability) * timeBoost;

  return Math.min(Math.max(finalProbability, 0), 1);
}

/**
 * Determine congestion state from metrics
 */
export function determineCongestionState(
  pendingTxCount: number,
  blockUtilization: number
): CongestionState {
  if (blockUtilization > 0.9 || pendingTxCount > 20000) {
    return 'severe';
  }
  if (blockUtilization > 0.75 || pendingTxCount > 10000) {
    return 'high';
  }
  if (blockUtilization > 0.5 || pendingTxCount > 5000) {
    return 'moderate';
  }
  return 'low';
}

/**
 * Calculate confidence score based on data freshness and volatility
 */
export function calculateConfidenceScore(
  freshnessMs: number,
  volatility: number = 0.1
): number {
  // Freshness decay - confidence drops after 5 seconds
  const freshnessScore = Math.exp(-freshnessMs / 5000);
  
  // Volatility penalty
  const volatilityScore = 1 - Math.min(volatility, 0.5);
  
  return Math.max(freshnessScore * volatilityScore, 0.1);
}

/**
 * Adjust fee recommendation based on urgency and tx type
 */
export function adjustFeeForUrgency(
  baseFee: bigint,
  priorityFee: bigint,
  urgency: Urgency,
  txType: TxType
): { maxFee: bigint; priority: bigint } {
  const urgencyMultipliers: Record<Urgency, number> = {
    low: 0.8,
    medium: 1.0,
    high: 1.3,
    urgent: 1.8,
  };

  const txTypeMultipliers: Record<TxType, number> = {
    transfer: 1.0,
    swap: 1.1,
    contract: 1.2,
  };

  const multiplier = urgencyMultipliers[urgency] * txTypeMultipliers[txType];
  
  const adjustedPriority = BigInt(Math.floor(Number(priorityFee) * multiplier));
  const adjustedMaxFee = baseFee + adjustedPriority;

  return {
    maxFee: adjustedMaxFee,
    priority: adjustedPriority,
  };
}

/**
 * Generate inclusion probability curve
 */
export function generateInclusionCurve(
  baseFee: bigint,
  priorityFee: bigint,
  urgency: Urgency,
  maxBlocks: number = 5
): Array<{ blocks: number; probability: number }> {
  const curve = [];
  for (let blocks = 1; blocks <= maxBlocks; blocks++) {
    const probability = calculateInclusionProbability(
      baseFee,
      priorityFee,
      urgency,
      blocks
    );
    curve.push({ blocks, probability });
  }
  return curve;
}

/**
 * Forecast base fee trend
 */
export function forecastBaseFee(
  currentBaseFee: bigint,
  blockUtilization: number,
  blocks: number
): bigint {
  // EIP-1559 formula approximation
  const targetUtilization = 0.5;
  const utilizationDelta = blockUtilization - targetUtilization;
  
  // 12.5% max change per block
  const maxChange = 0.125;
  const change = Math.max(-maxChange, Math.min(maxChange, utilizationDelta * 0.25));
  
  const multiplier = Math.pow(1 + change, blocks);
  return BigInt(Math.floor(Number(currentBaseFee) * multiplier));
}

/**
 * Determine base fee trend direction
 */
export function determineBasFeeTrend(
  currentBaseFee: bigint,
  previousBaseFee: bigint
): 'rising' | 'stable' | 'falling' {
  const diff = Number(currentBaseFee - previousBaseFee);
  const threshold = Number(previousBaseFee) * 0.05; // 5% threshold

  if (diff > threshold) return 'rising';
  if (diff < -threshold) return 'falling';
  return 'stable';
}
