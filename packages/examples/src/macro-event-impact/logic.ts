/**
 * Business logic functions for Macro Event Impact Vector API
 */

export interface MacroEvent {
  eventId: string;
  eventType: string;
  title: string;
  geography: string;
  timestamp: string;
  confidence: number;
}

export interface ImpactVector {
  eventId: string;
  sectors: Array<{
    sector: string;
    impact: number;
    confidence: number;
  }>;
  horizon: string;
  sensitivity_breakdown?: Record<string, number>;
}

export interface ScenarioScore {
  eventId: string;
  scenario_score: number;
  confidence_band: {
    lower: number;
    upper: number;
  };
  sectors: Array<{
    sector: string;
    score: number;
  }>;
}

export function filterEventsByType(
  events: MacroEvent[],
  eventTypes?: string[]
): MacroEvent[] {
  if (!eventTypes || eventTypes.length === 0) {
    return events;
  }
  return events.filter(e => eventTypes.includes(e.eventType));
}

export function filterEventsByGeography(
  events: MacroEvent[],
  geography?: string
): MacroEvent[] {
  if (!geography) {
    return events;
  }
  return events.filter(e => e.geography === geography);
}

export function filterEventsByDateRange(
  events: MacroEvent[],
  startDate?: string,
  endDate?: string
): MacroEvent[] {
  let filtered = events;
  
  if (startDate) {
    filtered = filtered.filter(e => e.timestamp >= startDate);
  }
  
  if (endDate) {
    filtered = filtered.filter(e => e.timestamp <= endDate);
  }
  
  return filtered;
}

export function calculateImpactVector(
  eventType: string,
  sectors: string[],
  horizon: string
): ImpactVector['sectors'] {
  const baseImpacts: Record<string, Record<string, number>> = {
    interest_rate: {
      tech: -0.3,
      finance: 0.4,
      real_estate: -0.5,
      consumer: -0.2,
    },
    gdp: {
      tech: 0.5,
      finance: 0.3,
      real_estate: 0.4,
      consumer: 0.6,
    },
    inflation: {
      tech: -0.2,
      finance: -0.1,
      real_estate: -0.3,
      consumer: -0.4,
    },
  };

  const horizonMultiplier = {
    short: 0.5,
    medium: 1.0,
    long: 1.5,
  }[horizon] || 1.0;

  const impacts = baseImpacts[eventType] || {};
  
  return sectors.map(sector => ({
    sector,
    impact: (impacts[sector] || 0) * horizonMultiplier,
    confidence: 0.85,
  }));
}

export function calculateSensitivityBreakdown(
  eventType: string
): Record<string, number> {
  const breakdowns: Record<string, Record<string, number>> = {
    interest_rate: {
      interest_rate: 0.8,
      inflation: 0.15,
      gdp: 0.05,
    },
    gdp: {
      gdp: 0.7,
      employment: 0.2,
      consumer_spending: 0.1,
    },
    inflation: {
      inflation: 0.6,
      interest_rate: 0.3,
      commodity_prices: 0.1,
    },
  };

  return breakdowns[eventType] || { [eventType]: 1.0 };
}

export function calculateScenarioScore(
  baseImpact: number,
  assumptions: Record<string, unknown>
): number {
  let score = baseImpact;
  
  if (typeof assumptions.inflation === 'number') {
    score += assumptions.inflation * 0.1;
  }
  
  if (typeof assumptions.growth === 'number') {
    score += assumptions.growth * 0.15;
  }
  
  return Math.max(-1, Math.min(1, score));
}

export function calculateConfidenceBand(
  score: number,
  baseConfidence: number
): { lower: number; upper: number } {
  const spread = (1 - baseConfidence) * 0.5;
  return {
    lower: Math.max(-1, score - spread),
    upper: Math.min(1, score + spread),
  };
}
