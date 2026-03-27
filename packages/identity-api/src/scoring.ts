export interface TrustComponents {
  onchain_reputation: number;
  completion_history: number;
  dispute_resolution: number;
  peer_endorsements: number;
}

export interface TrustWeights {
  onchain_reputation: number;
  completion_history: number;
  dispute_resolution: number;
  peer_endorsements: number;
}

export interface FeedbackData {
  value: bigint | number;
  valueDecimals: number;
  tag1: string;
  isRevoked: boolean;
}

export interface TrustBreakdown {
  components: TrustComponents;
  weights: TrustWeights;
  overall_score: number;
}

export function calculateTrustScore(
  components: TrustComponents,
  weights: TrustWeights
): number {
  const score =
    components.onchain_reputation * weights.onchain_reputation +
    components.completion_history * weights.completion_history +
    components.dispute_resolution * weights.dispute_resolution +
    components.peer_endorsements * weights.peer_endorsements;

  return Math.round(score * 10) / 10;
}

export function calculateCompletionRate(
  completed: number,
  total: number
): number {
  if (total === 0) return 0;
  return completed / total;
}

export function calculateDisputeRate(disputes: number, total: number): number {
  if (total === 0) return 0;
  return disputes / total;
}

export function calculateConfidence(
  sampleCount: number,
  ageSeconds: number
): number {
  if (sampleCount === 0) return 0;

  // Sample confidence: logarithmic scale, saturates at 100 samples
  const sampleConfidence = Math.min(Math.log10(sampleCount + 1) / 2, 1);

  // Freshness confidence: exponential decay, half-life of 1 hour
  const freshnessConfidence = Math.exp(-ageSeconds / 3600);

  // Combined confidence
  return Math.round(sampleConfidence * freshnessConfidence * 100) / 100;
}

export function aggregateTrustBreakdown(
  feedbackData: FeedbackData[],
  completedTasks: number,
  disputes: number
): TrustBreakdown {
  // Filter out revoked feedback
  const validFeedback = feedbackData.filter((f) => !f.isRevoked);

  if (validFeedback.length === 0) {
    return {
      components: {
        onchain_reputation: 0,
        completion_history: 0,
        dispute_resolution: 0,
        peer_endorsements: 0,
      },
      weights: {
        onchain_reputation: 0.4,
        completion_history: 0.3,
        dispute_resolution: 0.2,
        peer_endorsements: 0.1,
      },
      overall_score: 0,
    };
  }

  // Calculate onchain reputation from feedback values
  const feedbackScores = validFeedback.map((f) => {
    const value = typeof f.value === 'bigint' ? Number(f.value) : f.value;
    return f.valueDecimals === 0 ? value : value / 10 ** f.valueDecimals;
  });

  const avgFeedback =
    feedbackScores.reduce((sum, score) => sum + score, 0) /
    feedbackScores.length;
  const onchain_reputation = Math.min(Math.max(avgFeedback, 0), 100);

  // Calculate completion history
  const totalTasks = completedTasks + disputes;
  const completion_history =
    totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  // Calculate dispute resolution (inverse of dispute rate)
  const dispute_resolution =
    totalTasks > 0 ? ((totalTasks - disputes) / totalTasks) * 100 : 100;

  // Calculate peer endorsements (count of positive feedback)
  const positiveFeedback = feedbackScores.filter((score) => score >= 70).length;
  const peer_endorsements =
    validFeedback.length > 0
      ? (positiveFeedback / validFeedback.length) * 100
      : 0;

  const components: TrustComponents = {
    onchain_reputation,
    completion_history,
    dispute_resolution,
    peer_endorsements,
  };

  const weights: TrustWeights = {
    onchain_reputation: 0.4,
    completion_history: 0.3,
    dispute_resolution: 0.2,
    peer_endorsements: 0.1,
  };

  const overall_score = calculateTrustScore(components, weights);

  return {
    components,
    weights,
    overall_score,
  };
}
