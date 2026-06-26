import type {
  RiskScoreResponse,
  ExposurePathsResponse,
  EntityProfileResponse,
} from '../schemas';

export interface RiskFactor {
  factor: string;
  weight: number;
  evidence: string[];
}

export interface CalculateRiskScoreParams {
  address: string;
  riskFactors: RiskFactor[];
}

export function calculateRiskScore(
  params: CalculateRiskScoreParams
): Omit<RiskScoreResponse, 'freshness' | 'confidence'> {
  const { riskFactors } = params;

  if (riskFactors.length === 0) {
    return {
      risk_score: 0,
      risk_factors: [],
      evidence_refs: [],
    };
  }

  // Calculate weighted risk score
  const totalWeight = riskFactors.reduce((sum, rf) => sum + rf.weight, 0);
  const rawScore = totalWeight / riskFactors.length;
  const risk_score = Math.min(1, rawScore);

  // Collect evidence references
  const evidence_refs = riskFactors.flatMap(rf =>
    rf.evidence.map((_, idx) => `${rf.factor}_${idx}`)
  );

  return {
    risk_score,
    risk_factors: riskFactors,
    evidence_refs,
  };
}

export interface GraphEdge {
  target: string;
  risk: number;
  confidence: number;
}

export interface FindExposurePathsParams {
  address: string;
  maxDepth: number;
  minConfidence?: number;
  graph: Record<string, GraphEdge[]>;
}

export function findExposurePaths(
  params: FindExposurePathsParams
): Omit<ExposurePathsResponse, 'freshness'> {
  const { address, maxDepth, minConfidence = 0, graph } = params;

  const paths: ExposurePathsResponse['paths'] = [];
  const visited = new Set<string>();

  function dfs(
    current: string,
    path: string[],
    pathRisk: number,
    pathConfidence: number,
    depth: number
  ) {
    if (depth >= maxDepth) return; // Changed from > to >=
    if (visited.has(current)) return;

    visited.add(current);
    const edges = graph[current] || [];

    for (const edge of edges) {
      const newPath = [...path, edge.target];
      const newRisk = Math.max(pathRisk, edge.risk);
      const newConfidence = Math.min(pathConfidence, edge.confidence);

      if (newConfidence >= minConfidence) {
        paths.push({
          path: newPath,
          risk_score: newRisk,
          confidence: newConfidence,
          evidence: [`Link from ${current} to ${edge.target}`],
        });

        dfs(edge.target, newPath, newRisk, newConfidence, depth + 1);
      }
    }

    visited.delete(current);
  }

  dfs(address, [address], 0, 1, 0);

  return {
    paths,
    total_paths: paths.length,
  };
}

export interface Transaction {
  timestamp: string;
  volume: string;
}

export interface RiskData {
  sanctionsProximity?: number;
  mixerExposure?: boolean;
  highRiskCounterparties?: number;
}

export interface BuildEntityProfileParams {
  address: string;
  transactions: Transaction[];
  riskData?: RiskData;
}

export function buildEntityProfile(
  params: BuildEntityProfileParams
): Omit<EntityProfileResponse, 'freshness' | 'confidence'> {
  const { address, transactions, riskData } = params;

  const totalVolume = transactions.reduce(
    (sum, tx) => sum + BigInt(tx.volume || '0'),
    BigInt(0)
  );

  const timestamps = transactions.map(tx => new Date(tx.timestamp).getTime());
  const firstSeen =
    timestamps.length > 0
      ? new Date(Math.min(...timestamps)).toISOString()
      : new Date().toISOString();
  const lastSeen =
    timestamps.length > 0
      ? new Date(Math.max(...timestamps)).toISOString()
      : new Date().toISOString();

  const labels: string[] = [];
  if (transactions.length > 500) {
    labels.push('high-volume');
  }
  if (totalVolume > BigInt(1000000)) {
    labels.push('whale');
  }

  return {
    address,
    labels,
    risk_indicators: {
      sanctions_proximity: riskData?.sanctionsProximity ?? 0,
      mixer_exposure: riskData?.mixerExposure ?? false,
      high_risk_counterparties: riskData?.highRiskCounterparties ?? 0,
    },
    transaction_stats: {
      total_volume: totalVolume.toString(),
      transaction_count: transactions.length,
      first_seen: firstSeen,
      last_seen: lastSeen,
    },
  };
}

export function computeFreshness(dataTimestamp: string) {
  const now = Date.now();
  const dataTime = new Date(dataTimestamp).getTime();
  const staleness_seconds = Math.floor((now - dataTime) / 1000);

  return {
    data_timestamp: dataTimestamp,
    staleness_seconds: Math.max(0, staleness_seconds),
  };
}

export function validateConfidence(confidence: number): number {
  return Math.max(0, Math.min(1, confidence));
}
