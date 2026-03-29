import type { ReputationRequest, ReputationResponse, HistoryRequest, HistoryResponse, HistoryEvent, TrustBreakdownRequest, TrustBreakdownResponse, TrustComponent, OnchainIdentityState, Freshness } from './schema';

export function generateFreshness(stalenessMs: number = 0): Freshness {
  return {
    generated_at: new Date().toISOString(),
    staleness_ms: stalenessMs,
    sla_status: stalenessMs < 300000 ? 'fresh' : stalenessMs < 3600000 ? 'stale' : 'expired',
  };
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export function getReputation(request: ReputationRequest): ReputationResponse {
  const hash = simpleHash(request.agentAddress + request.chain);
  const completionRate = 0.80 + (hash % 20) / 100;
  const disputeRate = (hash % 10) / 100;
  const trustScore = Math.max(0, Math.min(100, completionRate * 80 - disputeRate * 50 + (hash % 20)));
  const registered = hash % 10 > 2;
  
  return {
    trust_score: trustScore,
    completion_rate: completionRate,
    dispute_rate: disputeRate,
    onchain_identity_state: {
      registered,
      verified: registered && hash % 10 > 5,
      metadata_uri: registered ? `ipfs://Qm${request.agentAddress.slice(2, 48)}` : null,
    },
    evidence_urls: Array.from({ length: Math.min(request.evidenceDepth || 3, 5) }, (_, i) => 
      `https://evidence.daydreams.systems/agent/${request.agentAddress}/attestation/${i + 1}`
    ),
    freshness: generateFreshness(0),
    confidence: 0.85 + (hash % 12) / 100,
  };
}

export function getHistory(request: HistoryRequest): HistoryResponse {
  const hash = simpleHash(request.agentAddress + request.chain + 'history');
  const days = request.timeframe === '7d' ? 7 : request.timeframe === '90d' ? 90 : request.timeframe === 'all' ? 365 : 30;
  const eventCount = Math.min(20, Math.floor(days / 3) + (hash % 10));
  const eventTypes: HistoryEvent['event_type'][] = ['task_completed', 'task_completed', 'task_completed', 'payment_received', 'payment_sent', 'task_failed', 'dispute_opened'];
  const now = Date.now();
  
  const events: HistoryEvent[] = Array.from({ length: eventCount }, (_, i) => {
    const eventType = eventTypes[(hash + i) % eventTypes.length];
    return {
      event_type: eventType,
      timestamp: new Date(now - (i + 1) * (days / eventCount) * 86400000).toISOString(),
      counterparty: `0x${((hash + i) % 1000000).toString(16).padStart(40, '0')}`,
      amount_usd: eventType.includes('payment') || eventType.includes('task') ? 10 + (hash + i) % 990 : undefined,
      tx_hash: `0x${((hash * (i + 1)) % 10000000000).toString(16).padStart(64, '0')}`,
      outcome: eventType === 'task_failed' ? 'failure' : eventType === 'dispute_opened' ? 'pending' : 'success',
    };
  });

  const totalTasks = events.filter(e => e.event_type === 'task_completed' || e.event_type === 'task_failed').length;
  const successfulTasks = events.filter(e => e.event_type === 'task_completed' && e.outcome === 'success').length;
  
  return {
    events,
    total_tasks: totalTasks,
    successful_tasks: successfulTasks,
    total_volume_usd: events.filter(e => e.amount_usd).reduce((sum, e) => sum + (e.amount_usd || 0), 0),
    active_since: new Date(now - (hash % 365) * 86400000).toISOString(),
    freshness: generateFreshness(0),
    confidence: 0.88 + (hash % 10) / 100,
  };
}

export function getTrustBreakdown(request: TrustBreakdownRequest): TrustBreakdownResponse {
  const hash = simpleHash(request.agentAddress + request.chain + 'breakdown');
  
  const components: TrustComponent[] = [
    { component: 'completion_history', score: 70 + (hash % 30), weight: 0.35, evidence_count: 10 + (hash % 50), description: 'Historical task completion rate and quality' },
    { component: 'dispute_record', score: 80 + (hash % 20), weight: 0.25, evidence_count: hash % 10, description: 'Dispute frequency and resolution outcomes' },
    { component: 'payment_reliability', score: 75 + (hash % 25), weight: 0.20, evidence_count: 5 + (hash % 30), description: 'On-time payment history and volume' },
    { component: 'peer_attestations', score: 60 + (hash % 40), weight: 0.12, evidence_count: hash % 20, description: 'Attestations from other verified agents' },
    { component: 'onchain_activity', score: 65 + (hash % 35), weight: 0.08, evidence_count: 20 + (hash % 100), description: 'Blockchain transaction history and patterns' },
  ];

  const riskFlags: string[] = [];
  components.forEach(c => {
    if (c.score < 50) riskFlags.push(`low_${c.component}_score`);
    if (c.evidence_count < 3) riskFlags.push(`insufficient_${c.component}_evidence`);
  });
  if (hash % 20 === 0) riskFlags.push('new_agent');

  return {
    overall_score: Math.round(components.reduce((sum, c) => sum + c.score * c.weight, 0) * 10) / 10,
    components,
    risk_flags: riskFlags,
    recommendations: riskFlags.length === 0 
      ? ['Agent has strong reputation - suitable for standard transactions']
      : riskFlags.includes('new_agent') 
        ? ['Consider starting with smaller transactions'] 
        : ['Request additional verification before high-value tasks'],
    evidence_urls: Array.from({ length: Math.min(request.evidenceDepth || 3, 5) }, (_, i) => 
      `https://evidence.daydreams.systems/agent/${request.agentAddress}/attestation/${i + 1}`
    ),
    freshness: generateFreshness(0),
    confidence: 0.90 + (hash % 8) / 100,
  };
}
