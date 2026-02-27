// Business logic for supplier reliability calculations
// This is a mock implementation for demonstration purposes

export function calculateSupplierScore(
  supplierId: string,
  category: string | undefined,
  region: string
): number {
  // Mock implementation: deterministic hash-based score
  const hash = hashString(`${supplierId}-${category}-${region}`);
  return (hash % 100) / 100;
}

export function forecastLeadTime(
  supplierId: string,
  category: string | undefined,
  region: string,
  horizonDays: number
) {
  const baseLeadTime = 10 + (hashString(supplierId) % 20);
  const variability = 1 + (horizonDays / 30) * 0.5;
  
  return {
    lead_time_p50: Math.round(baseLeadTime * variability),
    lead_time_p95: Math.round(baseLeadTime * variability * 1.8),
    drift_probability: Math.min(0.05 + (horizonDays / 365) * 0.3, 0.95),
  };
}

export function detectDisruptions(
  supplierId: string,
  region: string,
  riskTolerance: string
) {
  const baseRisk = (hashString(`${supplierId}-${region}`) % 50) / 100;
  const threshold = riskTolerance === 'low' ? 0.1 : riskTolerance === 'high' ? 0.4 : 0.25;
  
  const reasons: string[] = [];
  if (baseRisk > 0.2) reasons.push('port_congestion');
  if (baseRisk > 0.3) reasons.push('weather_event');
  if (baseRisk > 0.4) reasons.push('geopolitical_risk');
  
  const filteredReasons = reasons.filter((_, i) => baseRisk > threshold + i * 0.1);
  
  let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (baseRisk > 0.4) severity = 'critical';
  else if (baseRisk > 0.3) severity = 'high';
  else if (baseRisk > 0.2) severity = 'medium';
  
  return {
    disruption_probability: baseRisk,
    alert_reasons: filteredReasons,
    severity,
  };
}

export function calculateConfidence(dataPoints: number): number {
  if (dataPoints === 0) return 0.1;
  return Math.min(0.5 + Math.log10(dataPoints + 1) / 4, 0.99);
}

export function calculateFreshness(): number {
  // Mock: random freshness between 30 minutes and 4 hours
  return 1800000 + Math.floor(Math.random() * 12600000);
}

// Simple hash function for deterministic mock data
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}
