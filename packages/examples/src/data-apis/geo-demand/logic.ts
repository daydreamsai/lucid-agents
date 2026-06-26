import type {
  DemandIndexRequest,
  DemandIndexResponse,
  DemandTrendRequest,
  DemandTrendResponse,
  DemandAnomaliesRequest,
  DemandAnomaliesResponse,
  Freshness,
  Anomaly,
} from './schema';

/**
 * Generate freshness metadata for responses
 */
export function generateFreshness(stalenessMs: number = 0): Freshness {
  const now = new Date();
  return {
    generated_at: now.toISOString(),
    staleness_ms: stalenessMs,
    sla_status: stalenessMs < 300000 ? 'fresh' : stalenessMs < 3600000 ? 'stale' : 'expired',
  };
}

/**
 * Calculate demand index based on geo and category
 * In production, this would query real data sources
 */
export function calculateDemandIndex(request: DemandIndexRequest): DemandIndexResponse {
  // Deterministic mock based on geoCode hash
  const hash = simpleHash(request.geoCode + (request.category || ''));
  const baseIndex = 40 + (hash % 50);
  const velocity = ((hash % 100) - 50) / 10;
  const confidence = 0.85 + (hash % 15) / 100;
  
  const margin = (100 - confidence * 100) / 2;
  
  return {
    demand_index: baseIndex,
    velocity,
    confidence_interval: {
      lower: Math.max(0, baseIndex - margin),
      upper: Math.min(100, baseIndex + margin),
    },
    anomaly_flags: detectQuickAnomalies(baseIndex, velocity),
    comparable_geos: generateComparableGeos(request.geoCode, request.geoType),
    freshness: generateFreshness(0),
    confidence,
  };
}

/**
 * Calculate demand trend with historical data
 */
export function calculateDemandTrend(request: DemandTrendRequest): DemandTrendResponse {
  const hash = simpleHash(request.geoCode + (request.category || '') + 'trend');
  const velocity = ((hash % 100) - 50) / 10;
  const acceleration = ((hash % 50) - 25) / 100;
  
  const direction = velocity > 1 ? 'rising' : velocity < -1 ? 'falling' : 'stable';
  const momentum = 50 + velocity * 5;
  
  // Generate historical points
  const points = generateHistoricalPoints(request.lookbackWindow || '30d', hash);
  
  return {
    velocity,
    acceleration,
    trend_direction: direction,
    momentum_score: Math.max(0, Math.min(100, momentum)),
    historical_points: points,
    freshness: generateFreshness(0),
    confidence: 0.88 + (hash % 10) / 100,
  };
}

/**
 * Detect demand anomalies
 */
export function detectDemandAnomalies(request: DemandAnomaliesRequest): DemandAnomaliesResponse {
  const hash = simpleHash(request.geoCode + (request.category || '') + 'anomaly');
  const baseline = 50 + (hash % 30);
  const current = baseline + ((hash % 40) - 20);
  
  const anomalies: Anomaly[] = [];
  const deviation = ((current - baseline) / baseline) * 100;
  
  if (Math.abs(deviation) > 15) {
    anomalies.push({
      type: deviation > 0 ? 'spike' : 'drop',
      severity: Math.abs(deviation) > 30 ? 'high' : Math.abs(deviation) > 20 ? 'medium' : 'low',
      detected_at: new Date().toISOString(),
      description: `Demand ${deviation > 0 ? 'spike' : 'drop'} detected in ${request.geoCode}`,
      expected_value: baseline,
      actual_value: current,
      deviation_percent: deviation,
    });
  }
  
  return {
    anomalies,
    anomaly_score: Math.min(100, Math.abs(deviation) * 2),
    baseline_demand: baseline,
    current_demand: current,
    freshness: generateFreshness(0),
    confidence: 0.90 + (hash % 8) / 100,
  };
}

// Helper functions
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function detectQuickAnomalies(index: number, velocity: number): string[] {
  const flags: string[] = [];
  if (index > 85) flags.push('high_demand');
  if (index < 25) flags.push('low_demand');
  if (Math.abs(velocity) > 4) flags.push('rapid_change');
  return flags;
}

function generateComparableGeos(geoCode: string, geoType: string): string[] {
  const hash = simpleHash(geoCode);
  const base = parseInt(geoCode) || hash;
  return [
    String(base + 1).padStart(5, '0'),
    String(base + 2).padStart(5, '0'),
    String(Math.abs(base - 1)).padStart(5, '0'),
  ].slice(0, 3);
}

function generateHistoricalPoints(window: string, hash: number): Array<{ timestamp: string; value: number }> {
  const days = window === '7d' ? 7 : window === '90d' ? 90 : 30;
  const points: Array<{ timestamp: string; value: number }> = [];
  const now = Date.now();
  
  for (let i = days; i >= 0; i -= Math.ceil(days / 10)) {
    const timestamp = new Date(now - i * 24 * 60 * 60 * 1000).toISOString();
    const value = 50 + ((hash + i) % 40) - 20;
    points.push({ timestamp, value });
  }
  
  return points;
}
