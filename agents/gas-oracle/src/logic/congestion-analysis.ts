import type { CongestionState } from '../schemas/index.js';

export type CongestionInput = {
  /** Gas limit used in the latest block */
  gasUsed: bigint;
  /** Total gas limit of the latest block */
  gasLimit: bigint;
  /** Number of pending transactions in the mempool */
  pendingTxCount: number;
  /** Current base fee in wei */
  baseFeeWei: bigint;
};

export type CongestionAnalysis = {
  congestion_state: CongestionState;
  utilisation_percent: number;
  confidence_score: number;
};

const GWEI = 1_000_000_000n;

/**
 * Classify network congestion based on block utilisation and mempool depth.
 */
export function analyseCongestion(input: CongestionInput): CongestionAnalysis {
  const utilisationRaw =
    input.gasLimit > 0n
      ? Number((input.gasUsed * 10000n) / input.gasLimit) / 100
      : 0;
  const utilisation_percent = Math.min(100, Math.max(0, utilisationRaw));

  // Additional signal: large mempool implies pressure
  const mempoolPressure =
    input.pendingTxCount > 50_000
      ? 'high'
      : input.pendingTxCount > 10_000
      ? 'moderate'
      : 'low';

  let congestion_state: CongestionState;

  if (utilisation_percent >= 95 || mempoolPressure === 'high') {
    congestion_state = 'critical';
  } else if (utilisation_percent >= 80 || mempoolPressure === 'moderate') {
    congestion_state = 'high';
  } else if (utilisation_percent >= 50) {
    congestion_state = 'moderate';
  } else {
    congestion_state = 'low';
  }

  // Confidence degrades when data is stale or signals conflict
  const confidence_score = parseFloat(
    (mempoolPressure === 'high' && utilisation_percent < 50 ? 0.6 : 0.9).toFixed(2)
  );

  return { congestion_state, utilisation_percent, confidence_score };
}
