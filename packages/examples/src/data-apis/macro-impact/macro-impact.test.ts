import { describe, expect, it } from 'vitest';

import { generateFreshness, getEvents, getImpactVectors, scoreScenario } from './logic';
import { EventsRequestSchema, EventsResponseSchema, ImpactVectorsRequestSchema, ImpactVectorsResponseSchema, ScenarioScoreRequestSchema, ScenarioScoreResponseSchema } from './schema';

describe('Contract Tests', () => {
  it('accepts valid events request', () => expect(EventsRequestSchema.safeParse({}).success).toBe(true));
  it('rejects invalid event type', () => expect(EventsRequestSchema.safeParse({ eventTypes: ['invalid'] }).success).toBe(false));
  it('accepts valid scenario', () => expect(ScenarioScoreRequestSchema.safeParse({ scenarioAssumptions: [{ variable: 'x', change_percent: 1 }] }).success).toBe(true));
  it('rejects empty assumptions', () => expect(ScenarioScoreRequestSchema.safeParse({ scenarioAssumptions: [] }).success).toBe(false));
  it('validates events response', () => expect(EventsResponseSchema.safeParse(getEvents({})).success).toBe(true));
  it('validates impact response', () => expect(ImpactVectorsResponseSchema.safeParse(getImpactVectors({})).success).toBe(true));
  it('validates scenario response', () => expect(ScenarioScoreResponseSchema.safeParse(scoreScenario({ scenarioAssumptions: [{ variable: 'x', change_percent: 1 }] })).success).toBe(true));
});

describe('Business Logic', () => {
  it('returns events', () => expect(getEvents({}).event_feed.length).toBeGreaterThan(0));
  it('respects limit', () => expect(getEvents({ limit: 5 }).event_feed.length).toBe(5));
  it('filters by type', () => getEvents({ eventTypes: ['rate_decision'] }).event_feed.forEach(e => expect(e.event_type).toBe('rate_decision')));
  it('returns vectors', () => expect(getImpactVectors({}).impact_vector.length).toBeGreaterThan(0));
  it('scores in range', () => { const r = scoreScenario({ scenarioAssumptions: [{ variable: 'x', change_percent: 10 }] }); expect(r.scenario_score).toBeGreaterThanOrEqual(-100); expect(r.scenario_score).toBeLessThanOrEqual(100); });
});

describe('Freshness', () => {
  it('fresh', () => expect(generateFreshness(0).sla_status).toBe('fresh'));
  it('stale', () => expect(generateFreshness(400000).sla_status).toBe('stale'));
  it('expired', () => expect(generateFreshness(4000000).sla_status).toBe('expired'));
});
