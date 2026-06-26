import { describe, expect, it } from 'bun:test';
import {
  EventsRequestSchema,
  ImpactVectorRequestSchema,
  ScenarioScoreRequestSchema,
  MacroEventSchema,
  ImpactVectorSchema,
  ScenarioScoreSchema,
  ErrorResponseSchema,
} from '../schemas';

/**
 * Contract tests for Macro Event Impact Vector API
 */

describe('Contract: Request Schemas', () => {
  it('validates EventsRequest schema', () => {
    const valid = {
      eventTypes: ['interest_rate', 'gdp'],
      geography: 'US',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    };
    expect(() => EventsRequestSchema.parse(valid)).not.toThrow();

    const minimal = {};
    expect(() => EventsRequestSchema.parse(minimal)).not.toThrow();
  });

  it('validates ImpactVectorRequest schema', () => {
    const valid = {
      eventId: 'evt_123',
      sectorSet: ['tech', 'finance'],
      horizon: 'medium' as const,
    };
    expect(() => ImpactVectorRequestSchema.parse(valid)).not.toThrow();

    const minimal = { eventId: 'evt_123' };
    expect(() => ImpactVectorRequestSchema.parse(minimal)).not.toThrow();
  });

  it('validates ScenarioScoreRequest schema', () => {
    const valid = {
      eventId: 'evt_123',
      scenarioAssumptions: { inflation: 3.5, growth: 2.1 },
      sectors: ['tech', 'energy'],
    };
    expect(() => ScenarioScoreRequestSchema.parse(valid)).not.toThrow();
  });

  it('rejects invalid horizon values', () => {
    const invalid = {
      eventId: 'evt_123',
      horizon: 'invalid',
    };
    expect(() => ImpactVectorRequestSchema.parse(invalid)).toThrow();
  });
});

describe('Contract: Response Schemas', () => {
  it('validates MacroEvent schema', () => {
    const valid = {
      eventId: 'evt_123',
      eventType: 'interest_rate',
      title: 'Fed Rate Hike',
      geography: 'US',
      timestamp: '2024-01-15T10:00:00Z',
      confidence: 0.95,
      freshness: {
        dataTimestamp: '2024-01-15T10:00:00Z',
        ageSeconds: 300,
      },
    };
    expect(() => MacroEventSchema.parse(valid)).not.toThrow();
  });

  it('validates ImpactVector schema', () => {
    const valid = {
      eventId: 'evt_123',
      sectors: [
        { sector: 'tech', impact: 0.3, confidence: 0.85 },
        { sector: 'finance', impact: -0.2, confidence: 0.9 },
      ],
      horizon: 'medium',
      freshness: {
        dataTimestamp: '2024-01-15T10:00:00Z',
        ageSeconds: 300,
      },
      sensitivity_breakdown: {
        interest_rate: 0.7,
        gdp: 0.3,
      },
    };
    expect(() => ImpactVectorSchema.parse(valid)).not.toThrow();
  });

  it('validates ScenarioScore schema', () => {
    const valid = {
      eventId: 'evt_123',
      scenario_score: 0.65,
      confidence_band: {
        lower: 0.55,
        upper: 0.75,
      },
      sectors: [
        { sector: 'tech', score: 0.7 },
        { sector: 'finance', score: 0.6 },
      ],
      freshness: {
        dataTimestamp: '2024-01-15T10:00:00Z',
        ageSeconds: 300,
      },
    };
    expect(() => ScenarioScoreSchema.parse(valid)).not.toThrow();
  });

  it('rejects impact values outside [-1, 1] range', () => {
    const invalid = {
      eventId: 'evt_123',
      sectors: [{ sector: 'tech', impact: 1.5, confidence: 0.85 }],
      horizon: 'medium',
      freshness: {
        dataTimestamp: '2024-01-15T10:00:00Z',
        ageSeconds: 300,
      },
    };
    expect(() => ImpactVectorSchema.parse(invalid)).toThrow();
  });

  it('rejects confidence values outside [0, 1] range', () => {
    const invalid = {
      eventId: 'evt_123',
      eventType: 'interest_rate',
      title: 'Fed Rate Hike',
      geography: 'US',
      timestamp: '2024-01-15T10:00:00Z',
      confidence: 1.5,
      freshness: {
        dataTimestamp: '2024-01-15T10:00:00Z',
        ageSeconds: 300,
      },
    };
    expect(() => MacroEventSchema.parse(invalid)).toThrow();
  });
});

describe('Contract: Error Response Schema', () => {
  it('validates error response structure', () => {
    const valid = {
      error: {
        code: 'INVALID_EVENT_ID',
        message: 'Event not found',
        details: { eventId: 'evt_999' },
      },
    };
    expect(() => ErrorResponseSchema.parse(valid)).not.toThrow();
  });

  it('allows error response without details', () => {
    const valid = {
      error: {
        code: 'PAYMENT_REQUIRED',
        message: 'Payment required for this endpoint',
      },
    };
    expect(() => ErrorResponseSchema.parse(valid)).not.toThrow();
  });
});
