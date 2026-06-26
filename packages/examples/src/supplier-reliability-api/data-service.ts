/**
 * Supplier Reliability Data Service - Core business logic
 */
import type {
  SupplierId, Category, Region, RiskTolerance,
  SupplierScoreOutput, LeadTimeForecastOutput, DisruptionAlertsOutput,
  Confidence, FreshnessMetadata, AlertReason,
} from './schemas';

interface SupplierData {
  id: string; name: string; fillRate: number; onTimeDeliveryRate: number;
  qualityScore: number; baseLeadTimeDays: number; leadTimeVariance: number;
  regions: string[]; categories: string[]; riskFactors: string[];
  lastUpdated: Date; sampleSize: number;
}

const MOCK_SUPPLIERS: Map<string, SupplierData> = new Map([
  ['SUP001', {
    id: 'SUP001', name: 'Acme Electronics', fillRate: 0.95, onTimeDeliveryRate: 0.92,
    qualityScore: 88, baseLeadTimeDays: 14, leadTimeVariance: 3,
    regions: ['APAC', 'NA', 'EU'], categories: ['electronics', 'components'],
    riskFactors: [], lastUpdated: new Date(Date.now() - 3600000), sampleSize: 1250,
  }],
  ['SUP002', {
    id: 'SUP002', name: 'Global Parts Co', fillRate: 0.87, onTimeDeliveryRate: 0.78,
    qualityScore: 72, baseLeadTimeDays: 21, leadTimeVariance: 7,
    regions: ['APAC', 'EU'], categories: ['components', 'raw-materials'],
    riskFactors: ['port_congestion', 'capacity_constraints'],
    lastUpdated: new Date(Date.now() - 7200000), sampleSize: 890,
  }],
  ['SUP003', {
    id: 'SUP003', name: 'Premium Logistics', fillRate: 0.99, onTimeDeliveryRate: 0.97,
    qualityScore: 95, baseLeadTimeDays: 7, leadTimeVariance: 1,
    regions: ['NA', 'EU', 'LATAM'], categories: ['finished-goods', 'electronics'],
    riskFactors: [], lastUpdated: new Date(Date.now() - 1800000), sampleSize: 3200,
  }],
]);

function createFreshness(lastUpdated: Date, source: string): FreshnessMetadata {
  return { freshness_ms: Date.now() - lastUpdated.getTime(), last_updated: lastUpdated.toISOString(), source };
}

function calculateConfidence(sampleSize: number): Confidence {
  let level: 'low' | 'medium' | 'high', score: number;
  if (sampleSize >= 1000) { level = 'high'; score = Math.min(0.95, 0.7 + (sampleSize / 10000) * 0.25); }
  else if (sampleSize >= 100) { level = 'medium'; score = 0.5 + (sampleSize / 1000) * 0.2; }
  else { level = 'low'; score = Math.max(0.1, sampleSize / 200); }
  return { level, score: Math.round(score * 100) / 100, sample_size: sampleSize };
}

function calculateSupplierScore(data: SupplierData): number {
  const weights = { fillRate: 0.35, onTime: 0.35, quality: 0.30 };
  return Math.round((data.fillRate * 100 * weights.fillRate + data.onTimeDeliveryRate * 100 * weights.onTime + data.qualityScore * weights.quality) * 10) / 10;
}

function calculateDisruptionProbability(data: SupplierData, riskTolerance: RiskTolerance): number {
  let prob = data.riskFactors.length * 0.15 + (1 - data.fillRate) * 0.3 + (1 - data.onTimeDeliveryRate) * 0.2;
  const mult = { low: 1.3, medium: 1.0, high: 0.7 };
  return Math.min(1, Math.round(prob * mult[riskTolerance] * 100) / 100);
}

function determineRiskLevel(p: number): 'low' | 'medium' | 'high' | 'critical' {
  if (p >= 0.7) return 'critical'; if (p >= 0.4) return 'high'; if (p >= 0.2) return 'medium'; return 'low';
}

function determineTrend(variance: number, base: number): 'improving' | 'stable' | 'degrading' {
  const r = variance / base; if (r > 0.3) return 'degrading'; if (r < 0.1) return 'improving'; return 'stable';
}

function getAlertDesc(code: string): string {
  const d: Record<string, string> = { port_congestion: 'Port congestion affecting shipments', capacity_constraints: 'Supplier capacity constraints detected' };
  return d[code] ?? 'Alert: ' + code;
}

function getAlertSev(code: string): 'info' | 'warning' | 'critical' {
  const s: Record<string, 'info' | 'warning' | 'critical'> = { port_congestion: 'warning', capacity_constraints: 'warning', quality_issues: 'critical' };
  return s[code] ?? 'info';
}

function generateAlertReasons(data: SupplierData): AlertReason[] {
  const alerts: AlertReason[] = [], now = new Date().toISOString();
  for (const f of data.riskFactors) alerts.push({ code: f, description: getAlertDesc(f), severity: getAlertSev(f), detected_at: now });
  if (data.fillRate < 0.9) alerts.push({ code: 'low_fill_rate', description: 'Fill rate below threshold: ' + (data.fillRate * 100).toFixed(1) + '%', severity: data.fillRate < 0.8 ? 'critical' : 'warning', detected_at: now });
  if (data.onTimeDeliveryRate < 0.85) alerts.push({ code: 'delivery_delays', description: 'On-time delivery rate: ' + (data.onTimeDeliveryRate * 100).toFixed(1) + '%', severity: data.onTimeDeliveryRate < 0.75 ? 'critical' : 'warning', detected_at: now });
  return alerts;
}

function generateRecommendations(alerts: AlertReason[], riskLevel: string): string[] {
  const r: string[] = [];
  if (riskLevel === 'critical' || riskLevel === 'high') { r.push('Consider activating backup suppliers'); r.push('Increase safety stock levels'); }
  for (const a of alerts) {
    if (a.code === 'port_congestion') r.push('Explore alternative shipping routes');
    if (a.code === 'capacity_constraints') r.push('Negotiate capacity reservation agreements');
    if (a.code === 'low_fill_rate') r.push('Review order quantities and timing');
  }
  if (r.length === 0) r.push('Continue monitoring supplier performance');
  return r;
}

export class SupplierDataService {
  private stalenessThresholdMs: number;
  constructor(stalenessThresholdMs: number = 24 * 60 * 60 * 1000) { this.stalenessThresholdMs = stalenessThresholdMs; }

  async getSupplierScore(supplierId: SupplierId, category?: Category, region?: Region): Promise<SupplierScoreOutput | null> {
    const data = MOCK_SUPPLIERS.get(supplierId);
    if (!data || (category && !data.categories.includes(category)) || (region && !data.regions.includes(region))) return null;
    return { supplier_id: data.id, supplier_score: calculateSupplierScore(data), fill_rate: data.fillRate, on_time_delivery_rate: data.onTimeDeliveryRate, quality_score: data.qualityScore, confidence: calculateConfidence(data.sampleSize), freshness: createFreshness(data.lastUpdated, 'supplier-db-v1') };
  }

  async getLeadTimeForecast(supplierId: SupplierId, category: Category, region: Region, horizonDays: number): Promise<LeadTimeForecastOutput | null> {
    const data = MOCK_SUPPLIERS.get(supplierId);
    if (!data || !data.categories.includes(category) || !data.regions.includes(region)) return null;
    const hf = 1 + (horizonDays / 365) * 0.2;
    return { supplier_id: data.id, category, region, horizon_days: horizonDays, lead_time_p50: Math.round(data.baseLeadTimeDays * hf * 10) / 10, lead_time_p95: Math.round((data.baseLeadTimeDays + data.leadTimeVariance * 2) * hf * 10) / 10, lead_time_drift: Math.round((data.leadTimeVariance - 2) * 10) / 10, trend: determineTrend(data.leadTimeVariance, data.baseLeadTimeDays), confidence: calculateConfidence(data.sampleSize), freshness: createFreshness(data.lastUpdated, 'forecast-model-v2') };
  }

  async getDisruptionAlerts(supplierId: SupplierId, riskTolerance: RiskTolerance, category?: Category, region?: Region): Promise<DisruptionAlertsOutput | null> {
    const data = MOCK_SUPPLIERS.get(supplierId);
    if (!data || (category && !data.categories.includes(category)) || (region && !data.regions.includes(region))) return null;
    const prob = calculateDisruptionProbability(data, riskTolerance), riskLevel = determineRiskLevel(prob), alerts = generateAlertReasons(data);
    return { supplier_id: data.id, disruption_probability: prob, risk_level: riskLevel, alert_reasons: alerts, recommended_actions: generateRecommendations(alerts, riskLevel), confidence: calculateConfidence(data.sampleSize), freshness: createFreshness(data.lastUpdated, 'risk-engine-v1') };
  }

  isDataStale(freshnessMs: number): boolean { return freshnessMs > this.stalenessThresholdMs; }
  async supplierExists(supplierId: SupplierId): Promise<boolean> { return MOCK_SUPPLIERS.has(supplierId); }
}

export const dataService = new SupplierDataService();
