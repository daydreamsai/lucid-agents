import type { EventsRequest, EventsResponse, Freshness, ImpactVector, ImpactVectorsRequest, ImpactVectorsResponse, MacroEvent, ScenarioScoreRequest, ScenarioScoreResponse } from './schema';

function simpleHash(str: string): number { let hash = 0; for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash = hash & hash; } return Math.abs(hash); }

export function generateFreshness(stalenessMs: number = 0): Freshness { return { generated_at: new Date().toISOString(), staleness_ms: stalenessMs, sla_status: stalenessMs < 300000 ? 'fresh' : stalenessMs < 3600000 ? 'stale' : 'expired' }; }

const EVENT_TYPES = ['rate_decision', 'gdp_release', 'inflation_data', 'employment', 'trade_balance', 'geopolitical', 'natural_disaster', 'policy_change'] as const;
const GEOGRAPHIES = ['global', 'north_america', 'europe', 'asia_pacific', 'emerging_markets', 'latam'] as const;
const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
const SECTORS = ['technology', 'financials', 'healthcare', 'energy', 'consumer', 'industrials', 'materials', 'utilities', 'real_estate'];

export function getEvents(request: EventsRequest): EventsResponse {
  const hash = simpleHash(JSON.stringify(request)); const limit = request.limit || 20; const now = Date.now();
  const events: MacroEvent[] = [];
  for (let i = 0; i < limit; i++) {
    const eventHash = simpleHash(`event_${hash}_${i}`);
    const eventType = request.eventTypes?.[(i) % request.eventTypes.length] || EVENT_TYPES[eventHash % EVENT_TYPES.length];
    const geography = request.geography || GEOGRAPHIES[eventHash % GEOGRAPHIES.length];
    events.push({ event_id: `evt_${eventHash.toString(16).slice(0, 12)}`, event_type: eventType, title: `${eventType.replace(/_/g, ' ').toUpperCase()} - ${geography}`, geography, timestamp: new Date(now - i * 3600000).toISOString(), severity: SEVERITIES[eventHash % SEVERITIES.length], summary: `Macro event affecting ${geography} markets.` });
  }
  return { event_feed: events, total_count: events.length, freshness: generateFreshness(0), confidence: 0.90 + (hash % 8) / 100 };
}

export function getImpactVectors(request: ImpactVectorsRequest): ImpactVectorsResponse {
  const hash = simpleHash(JSON.stringify(request)); const sectors = request.sectorSet || SECTORS;
  const magnitudes = ['minimal', 'moderate', 'significant', 'severe'] as const;
  const vectors: ImpactVector[] = sectors.map((sector) => { const sectorHash = simpleHash(sector + hash); const impactScore = ((sectorHash % 200) - 100); return { sector, impact_score: impactScore, direction: impactScore > 10 ? 'positive' : impactScore < -10 ? 'negative' : 'neutral', magnitude: magnitudes[Math.min(3, Math.floor(Math.abs(impactScore) / 25))], confidence_band: { lower: impactScore - 15, upper: impactScore + 15 } }; });
  const avgImpact = vectors.reduce((sum, v) => sum + v.impact_score, 0) / vectors.length;
  return { impact_vector: vectors, confidence_band: { lower: avgImpact - 20, upper: avgImpact + 20 }, sensitivity_breakdown: [{ factor: 'interest_rates', weight: 0.3 }, { factor: 'inflation', weight: 0.25 }, { factor: 'gdp_growth', weight: 0.2 }, { factor: 'currency', weight: 0.15 }, { factor: 'geopolitical', weight: 0.1 }], freshness: generateFreshness(0), confidence: 0.85 + (hash % 12) / 100 };
}

export function scoreScenario(request: ScenarioScoreRequest): ScenarioScoreResponse {
  const hash = simpleHash(JSON.stringify(request)); const sectors = request.sectorSet || SECTORS.slice(0, 5);
  const riskLevels = ['very_low', 'low', 'moderate', 'high', 'very_high'] as const;
  let totalScore = 0; const keyDrivers: string[] = [];
  request.scenarioAssumptions.forEach(a => { totalScore += a.change_percent * (a.probability || 0.5); if (Math.abs(a.change_percent) > 5) keyDrivers.push(`${a.variable}: ${a.change_percent > 0 ? '+' : ''}${a.change_percent}%`); });
  totalScore = Math.max(-100, Math.min(100, totalScore));
  const sectorImpacts = sectors.map(sector => { const impact = totalScore * (0.5 + (simpleHash(sector + hash) % 100) / 200); return { sector, impact: Math.round(impact * 10) / 10, direction: impact > 5 ? 'positive' as const : impact < -5 ? 'negative' as const : 'neutral' as const }; });
  return { scenario_score: Math.round(totalScore * 10) / 10, risk_assessment: riskLevels[Math.min(4, Math.floor((Math.abs(totalScore) + 20) / 30))], sector_impacts: sectorImpacts, key_drivers: keyDrivers.length > 0 ? keyDrivers : ['No significant drivers identified'], freshness: generateFreshness(0), confidence: 0.82 + (hash % 15) / 100 };
}
