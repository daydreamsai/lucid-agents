import { describe, expect, it } from 'bun:test';
import {
  filterEventsByType,
  filterEventsByGeography,
  filterEventsByDateRange,
  calculateImpactVector,
  calculateSensitivityBreakdown,
  calculateScenarioScore,
  calculateConfidenceBand,
  type MacroEvent,
} from '../logic';

/**
 * Business logic tests for Macro Event Impact Vector API
 */

describe('Business Logic: Event Filtering', () => {
  const mockEvents: MacroEvent[] = [
    {
      eventId: 'evt_1',
      eventType: 'interest_rate',
      title: 'Fed Rate Hike',
      geography: 'US',
      timestamp: '2024-01-15T10:00:00Z',
      confidence: 0.95,
    },
    {
      eventId: 'evt_2',
      eventType: 'gdp',
      title: 'GDP Growth Report',
      geography: 'EU',
      timestamp: '2024-02-20T10:00:00Z',
      confidence: 0.9,
    },
    {
      eventId: 'evt_3',
      eventType: 'inflation',
      title: 'CPI Data Release',
      geography: 'US',
      timestamp: '2024-03-10T10:00:00Z',
      confidence: 0.92,
    },
  ];

  it('filters events by type', () => {
    const result = filterEventsByType(mockEvents, ['interest_rate', 'gdp']);
    expect(result).toHaveLength(2);
    expect(result.map(e => e.eventType)).toEqual(['interest_rate', 'gdp']);
  });

  it('returns all events when no type filter provided', () => {
    const result = filterEventsByType(mockEvents);
    expect(result).toHaveLength(3);
  });

  it('filters events by geography', () => {
    const result = filterEventsByGeography(mockEvents, 'US');
    expect(result).toHaveLength(2);
    expect(result.every(e => e.geography === 'US')).toBe(true);
  });

  it('filters events by date range', () => {
    const result = filterEventsByDateRange(
      mockEvents,
      '2024-02-01T00:00:00Z',
      '2024-03-31T23:59:59Z'
    );
    expect(result).toHaveLength(2);
    expect(result.map(e => e.eventId)).toEqual(['evt_2', 'evt_3']);
  });

  it('filters by start date only', () => {
    const result = filterEventsByDateRange(mockEvents, '2024-02-01T00:00:00Z');
    expect(result).toHaveLength(2);
  });

  it('filters by end date only', () => {
    const result = filterEventsByDateRange(
      mockEvents,
      undefined,
      '2024-02-01T00:00:00Z'
    );
    expect(result).toHaveLength(1);
    expect(result[0].eventId).toBe('evt_1');
  });
});

describe('Business Logic: Impact Vector Calculation', () => {
  it('calculates impact vector for interest rate event', () => {
    const result = calculateImpactVector('interest_rate', ['tech', 'finance'], 'medium');
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      sector: 'tech',
      impact: -0.3,
      confidence: 0.85,
    });
    expect(result[1]).toMatchObject({
      sector: 'finance',
      impact: 0.4,
      confidence: 0.85,
    });
  });

  it('applies horizon multiplier correctly', () => {
    const short = calculateImpactVector('interest_rate', ['tech'], 'short');
    const medium = calculateImpactVector('interest_rate', ['tech'], 'medium');
    const long = calculateImpactVector('interest_rate', ['tech'], 'long');

    expect(short[0].impact).toBeCloseTo(-0.15, 2);
    expect(medium[0].impact).toBeCloseTo(-0.3, 2);
    expect(long[0].impact).toBeCloseTo(-0.45, 2);
  });

  it('returns zero impact for unknown sectors', () => {
    const result = calculateImpactVector('interest_rate', ['unknown_sector'], 'medium');
    expect(result[0].impact).toBe(0);
  });

  it('handles multiple sectors', () => {
    const result = calculateImpactVector('gdp', ['tech', 'finance', 'consumer'], 'medium');
    expect(result).toHaveLength(3);
    expect(result[0].impact).toBe(0.5);
    expect(result[1].impact).toBe(0.3);
    expect(result[2].impact).toBe(0.6);
  });
});

describe('Business Logic: Sensitivity Breakdown', () => {
  it('calculates sensitivity for interest rate events', () => {
    const result = calculateSensitivityBreakdown('interest_rate');
    expect(result).toEqual({
      interest_rate: 0.8,
      inflation: 0.15,
      gdp: 0.05,
    });
  });

  it('calculates sensitivity for GDP events', () => {
    const result = calculateSensitivityBreakdown('gdp');
    expect(result).toEqual({
      gdp: 0.7,
      employment: 0.2,
      consumer_spending: 0.1,
    });
  });

  it('returns default sensitivity for unknown event types', () => {
    const result = calculateSensitivityBreakdown('unknown_event');
    expect(result).toEqual({ unknown_event: 1.0 });
  });
});

describe('Business Logic: Scenario Scoring', () => {
  it('calculates scenario score with inflation assumption', () => {
    const result = calculateScenarioScore(0.5, { inflation: 2.0 });
    expect(result).toBeCloseTo(0.7, 2);
  });

  it('calculates scenario score with growth assumption', () => {
    const result = calculateScenarioScore(0.3, { growth: 2.0 });
    expect(result).toBeCloseTo(0.6, 2);
  });

  it('combines multiple assumptions', () => {
    const result = calculateScenarioScore(0.2, { inflation: 1.0, growth: 2.0 });
    expect(result).toBeCloseTo(0.6, 2);
  });

  it('clamps score to [-1, 1] range', () => {
    const high = calculateScenarioScore(0.9, { inflation: 5.0, growth: 5.0 });
    expect(high).toBe(1);

    const low = calculateScenarioScore(-0.9, { inflation: -5.0, growth: -5.0 });
    expect(low).toBe(-1);
  });
});

describe('Business Logic: Confidence Band Calculation', () => {
  it('calculates confidence band for high confidence score', () => {
    const result = calculateConfidenceBand(0.5, 0.9);
    expect(result.lower).toBeCloseTo(0.45, 2);
    expect(result.upper).toBeCloseTo(0.55, 2);
  });

  it('calculates wider band for low confidence', () => {
    const result = calculateConfidenceBand(0.5, 0.5);
    expect(result.lower).toBeCloseTo(0.25, 2);
    expect(result.upper).toBeCloseTo(0.75, 2);
  });

  it('clamps band to [-1, 1] range', () => {
    const result = calculateConfidenceBand(0.95, 0.5);
    expect(result.upper).toBe(1);
  });
});
