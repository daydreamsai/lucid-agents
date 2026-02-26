import type {
  Chain,
  ConfidenceAnnotation,
  EvidenceDepth,
  EvidenceUrl,
  FreshnessMetadata,
  HistoryEvent,
  HistoryRequest,
  HistoryResponse,
  OnchainIdentityState,
  ReputationRequest,
  ReputationResponse,
  Timeframe,
  TrustBreakdownRequest,
  TrustBreakdownResponse,
  TrustComponent,
} from './schemas';

// ============================================================================
// Types
// ============================================================================

export type ReputationDataSource = {
  fetchIdentityState(
    agentAddress: string,
    chain: Chain
  ): Promise<OnchainIdentityState>;
  fetchPerformanceMetrics(
    agentAddress: string,
    chain: Chain,
    timeframe: Timeframe
  ): Promise<{
    completionRate: number;
    disputeRate: number;
    totalTasks: number;
    totalDisputes: number;
  }>;
  fetchEvidence(
    agentAddress: string,
    chain: Chain,
    depth: EvidenceDepth
  ): Promise<EvidenceUrl[]>;
  fetchHistory(
    agentAddress: string,
    chain: Chain,
    limit: number,
    offset: number
  ): Promise<{ events: HistoryEvent[]; total: number }>;
  fetchTrustComponents(
    agentAddress: string,
    chain: Chain,
    timeframe: Timeframe
  ): Promise<TrustComponent[]>;
};

export type ReputationServiceConfig = {
  dataSource: ReputationDataSource;
  cacheTtlSeconds?: number;
  stalenessThresholdSeconds?: number;
};

// ============================================================================
// Scoring Logic
// ============================================================================

const TRUST_WEIGHTS = {
  completionRate: 0.4,
  disputeRate: 0.3,
  identityVerification: 0.2,
  historyLength: 0.1,
} as const;

export function calculateTrustScore(params: {
  completionRate: number;
  disputeRate: number;
  isRegistered: boolean;
  isActive: boolean;
  historyEventCount: number;
}): number {
  const { completionRate, disputeRate, isRegistered, isActive, historyEventCount } = params;

  // Completion rate contribution (0-100 -> 0-40)
  const completionScore = completionRate * TRUST_WEIGHTS.completionRate;

  // Dispute rate contribution (inverse: lower is better) (0-100 -> 0-30)
  const disputeScore = (100 - disputeRate) * TRUST_WEIGHTS.disputeRate;

  // Identity verification contribution (0-20)
  let identityScore = 0;
  if (isRegistered) identityScore += 10;
  if (isActive) identityScore += 10;
  identityScore *= TRUST_WEIGHTS.identityVerification / 0.2;

  // History length contribution (0-10)
  const historyScore = Math.min(historyEventCount / 100, 1) * 100 * TRUST_WEIGHTS.historyLength;

  const total = completionScore + disputeScore + identityScore + historyScore;
  return Math.round(total * 100) / 100;
}

export function calculateConfidence(params: {
  dataAge: number;
  evidenceCount: number;
  isRegistered: boolean;
  stalenessThreshold: number;
}): ConfidenceAnnotation {
  const { dataAge, evidenceCount, isRegistered, stalenessThreshold } = params;
  const factors: string[] = [];

  let score = 0.3; // Base score (lowered to allow for low confidence)

  // Freshness factor
  if (dataAge < stalenessThreshold / 2) {
    score += 0.25;
    factors.push('fresh_data');
  } else if (dataAge < stalenessThreshold) {
    score += 0.15;
    factors.push('recent_data');
  } else {
    score -= 0.1; // Penalty for stale data
    factors.push('stale_data');
  }

  // Evidence factor
  if (evidenceCount >= 50) {
    score += 0.25;
    factors.push('abundant_evidence');
  } else if (evidenceCount >= 10) {
    score += 0.15;
    factors.push('sufficient_evidence');
  } else {
    score -= 0.05; // Penalty for limited evidence
    factors.push('limited_evidence');
  }

  // Registration factor
  if (isRegistered) {
    score += 0.15;
    factors.push('verified_identity');
  }

  score = Math.max(0, Math.min(score, 1));

  let level: 'high' | 'medium' | 'low';
  if (score >= 0.8) {
    level = 'high';
  } else if (score >= 0.5) {
    level = 'medium';
  } else {
    level = 'low';
  }

  return { level, score: Math.round(score * 100) / 100, factors };
}

export function createFreshnessMetadata(
  lastUpdated: Date,
  source: 'onchain' | 'cache' | 'aggregated',
  cacheTtlSeconds?: number
): FreshnessMetadata {
  const now = new Date();
  const dataAge = Math.floor((now.getTime() - lastUpdated.getTime()) / 1000);

  const result: FreshnessMetadata = {
    lastUpdated: lastUpdated.toISOString(),
    dataAge,
    source,
  };

  if (cacheTtlSeconds) {
    const nextRefresh = new Date(lastUpdated.getTime() + cacheTtlSeconds * 1000);
    result.nextRefresh = nextRefresh.toISOString();
  }

  return result;
}

// ============================================================================
// Service Implementation
// ============================================================================

export class ReputationService {
  private dataSource: ReputationDataSource;
  private cacheTtlSeconds: number;
  private stalenessThresholdSeconds: number;

  constructor(config: ReputationServiceConfig) {
    this.dataSource = config.dataSource;
    this.cacheTtlSeconds = config.cacheTtlSeconds ?? 300; // 5 minutes default
    this.stalenessThresholdSeconds = config.stalenessThresholdSeconds ?? 3600; // 1 hour default
  }

  async getReputation(request: ReputationRequest): Promise<ReputationResponse> {
    const { agentAddress, chain, timeframe, evidenceDepth } = request;
    const fetchStart = new Date();

    // Fetch all data in parallel
    const [identityState, metrics, evidence, historyData] = await Promise.all([
      this.dataSource.fetchIdentityState(agentAddress, chain),
      this.dataSource.fetchPerformanceMetrics(agentAddress, chain, timeframe),
      this.dataSource.fetchEvidence(agentAddress, chain, evidenceDepth),
      this.dataSource.fetchHistory(agentAddress, chain, 1, 0), // Just to get total count
    ]);

    const trustScore = calculateTrustScore({
      completionRate: metrics.completionRate,
      disputeRate: metrics.disputeRate,
      isRegistered: identityState.registered,
      isActive: identityState.active,
      historyEventCount: historyData.total,
    });

    const freshness = createFreshnessMetadata(
      fetchStart,
      'aggregated',
      this.cacheTtlSeconds
    );

    const confidence = calculateConfidence({
      dataAge: freshness.dataAge,
      evidenceCount: evidence.length,
      isRegistered: identityState.registered,
      stalenessThreshold: this.stalenessThresholdSeconds,
    });

    return {
      agentAddress,
      chain,
      trustScore,
      completionRate: metrics.completionRate,
      disputeRate: metrics.disputeRate,
      onchainIdentityState: identityState,
      evidenceUrls: evidence,
      freshness,
      confidence,
    };
  }

  async getHistory(request: HistoryRequest): Promise<HistoryResponse> {
    const { agentAddress, chain, limit, offset } = request;
    const fetchStart = new Date();

    const { events, total } = await this.dataSource.fetchHistory(
      agentAddress,
      chain,
      limit,
      offset
    );

    const freshness = createFreshnessMetadata(
      fetchStart,
      'onchain',
      this.cacheTtlSeconds
    );

    return {
      agentAddress,
      chain,
      events,
      total,
      limit,
      offset,
      freshness,
    };
  }

  async getTrustBreakdown(
    request: TrustBreakdownRequest
  ): Promise<TrustBreakdownResponse> {
    const { agentAddress, chain, timeframe } = request;
    const fetchStart = new Date();

    const [components, identityState] = await Promise.all([
      this.dataSource.fetchTrustComponents(agentAddress, chain, timeframe),
      this.dataSource.fetchIdentityState(agentAddress, chain),
    ]);

    // Calculate overall score from weighted components
    const overallScore = components.reduce(
      (sum, c) => sum + c.score * c.weight,
      0
    );

    const freshness = createFreshnessMetadata(
      fetchStart,
      'aggregated',
      this.cacheTtlSeconds
    );

    const totalEvidence = components.reduce((sum, c) => sum + c.evidenceCount, 0);
    const confidence = calculateConfidence({
      dataAge: freshness.dataAge,
      evidenceCount: totalEvidence,
      isRegistered: identityState.registered,
      stalenessThreshold: this.stalenessThresholdSeconds,
    });

    return {
      agentAddress,
      chain,
      overallScore: Math.round(overallScore * 100) / 100,
      components,
      freshness,
      confidence,
    };
  }
}

export function createReputationService(
  config: ReputationServiceConfig
): ReputationService {
  return new ReputationService(config);
}
