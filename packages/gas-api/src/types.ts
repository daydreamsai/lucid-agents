export const LATENCY_TARGETS = ["instant", "fast", "standard", "economy"] as const;
export type LatencyTarget = (typeof LATENCY_TARGETS)[number];

export type CongestionLevel = "low" | "moderate" | "high" | "extreme";

export interface ChainFeeSnapshot {
  chain: string;
  timestamp: number;
  blockNumber: number;
  baseFeePerGasGwei: number;
  priorityFeeP50Gwei: number;
  priorityFeeP75Gwei: number;
  priorityFeeP90Gwei: number;
  priorityFeeP99Gwei: number;
  pendingTx: number;
  gasUsedRatio: number;
  baseFeeTrend: number;
}

export interface GasQuote {
  chain: string;
  latencyTarget: LatencyTarget;
  asOf: number;
  blockNumber: number;
  baseFeePerGasGwei: number;
  maxPriorityFeePerGasGwei: number;
  maxFeePerGasGwei: number;
  inclusionProbability: number;
  expectedInclusionSeconds: number;
}

export interface GasForecastItem {
  chain: string;
  blocksAhead: number;
  latencyTarget: LatencyTarget;
  baseFeePerGasGwei: number;
  maxPriorityFeePerGasGwei: number;
  maxFeePerGasGwei: number;
  inclusionProbability: number;
  expectedInclusionSeconds: number;
}

export interface GasForecast {
  chain: string;
  asOf: number;
  blockNumber: number;
  items: GasForecastItem[];
}

export interface CongestionReport {
  chain: string;
  asOf: number;
  blockNumber: number;
  score: number;
  level: CongestionLevel;
  pendingTx: number;
  gasUsedRatio: number;
  baseFeeTrend: number;
}