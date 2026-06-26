import { a2a } from '@lucid-agents/a2a';
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { beforeAll, describe, expect, it } from 'bun:test';
import { z } from 'zod';

import {
  EventsRequestSchema,
  ImpactVectorRequestSchema,
  ScenarioScoreRequestSchema,
  MacroEventSchema,
  ImpactVectorSchema,
  ScenarioScoreSchema,
} from '../schemas';
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
 * Integration tests for Macro Event Impact Vector API
 * 
 * Tests endpoint handlers without payment middleware to validate
 * core functionality. Payment middleware is tested separately.
 */

// Mock event database (same as index.ts)
const mockEvents: MacroEvent[] = [
  {
    eventId: 'evt_test_1',
    eventType: 'interest_rate',
    title: 'Fed Rate Decision',
    geography: 'US',
    timestamp: '2024-01-15T10:00:00Z',
    confidence: 0.95,
  },
  {
    eventId: 'evt_test_2',
    eventType: 'gdp',
    title: 'GDP Growth Report Q4',
    geography: 'US',
    timestamp: '2024-02-20T10:00:00Z',
    confidence: 0.9,
  },
  {
    eventId: 'evt_test_3',
    eventType: 'inflation',
    title: 'CPI Data Release',
    geography: 'EU',
    timestamp: '2024-03-10T10:00:00Z',
    confidence: 0.92,
  },
];

function calculateFreshness(dataTimestamp: string) {
  const now = new Date();
  const data = new Date(dataTimestamp);
  const ageSeconds = Math.floor((now.getTime() - data.getTime()) / 1000);
  return { dataTimestamp, ageSeconds };
}

// Register entrypoints without payment middleware for testing
function registerTestEntrypoints(
  addEntrypoint: ReturnType<typeof createAgentApp>['addEntrypoint']
) {
  addEntrypoint({
    key: 'macro-events',
    description: 'Get macro event feed with filters',
    input: EventsRequestSchema,
    output: z.object({
      event_feed: z.array(MacroEventSchema),
    }),
    handler: async ctx => {
      let events = mockEvents;
      events = filterEventsByType(events, ctx.input.eventTypes);
      events = filterEventsByGeography(events, ctx.input.geography);
      events = filterEventsByDateRange(events, ctx.input.startDate, ctx.input.endDate);
      const event_feed = events.map(event => ({
        ...event,
        freshness: calculateFreshness(event.timestamp),
      }));
      return { output: { event_feed } };
    },
  });

  addEntrypoint({
    key: 'macro-impact-vector',
    description: 'Get impact vector for a macro event',
    input: ImpactVectorRequestSchema,
    output: ImpactVectorSchema,
    handler: async ctx => {
      const event = mockEvents.find(e => e.eventId === ctx.input.eventId);
      if (!event) throw new Error(`Event not found: ${ctx.input.eventId}`);
      const sectors = ctx.input.sectorSet || ['tech', 'finance', 'real_estate', 'consumer'];
      const horizon = ctx.input.horizon || 'medium';
      const impactSectors = calculateImpactVector(event.eventType, sectors, horizon);
      const sensitivity_breakdown = calculateSensitivityBreakdown(event.eventType);
      return {
        output: {
          eventId: ctx.input.eventId,
          sectors: impactSectors,
          horizon,
          freshness: calculateFreshness(event.timestamp),
          sensitivity_breakdown,
        },
      };
    },
  });

  addEntrypoint({
    key: 'macro-scenario-score',
    description: 'Calculate scenario score for a macro event',
    input: ScenarioScoreRequestSchema,
    output: ScenarioScoreSchema,
    handler: async ctx => {
      const event = mockEvents.find(e => e.eventId === ctx.input.eventId);
      if (!event) throw new Error(`Event not found: ${ctx.input.eventId}`);
      const sectors = ctx.input.sectors || ['tech', 'finance', 'real_estate', 'consumer'];
      const impactVectors = calculateImpactVector(event.eventType, sectors, 'medium');
      const avgImpact = impactVectors.reduce((sum, s) => sum + s.impact, 0) / impactVectors.length;
      const scenario_score = calculateScenarioScore(avgImpact, ctx.input.scenarioAssumptions);
      const confidence_band = calculateConfidenceBand(scenario_score, event.confidence);
      const sectorScores = impactVectors.map(s => ({
        sector: s.sector,
        score: calculateScenarioScore(s.impact, ctx.input.scenarioAssumptions),
      }));
      return {
        output: {
          eventId: ctx.input.eventId,
          scenario_score,
          confidence_band,
          sectors: sectorScores,
          freshness: calculateFreshness(event.timestamp),
        },
      };
    },
  });
}

let app: { fetch: (req: Request) => Response | Promise<Response> };

beforeAll(async () => {
  const agent = await createAgent({
    name: 'macro-event-impact-test',
    version: '1.0.0',
    description: 'Test agent without payments',
  })
    .use(http())
    .use(a2a())
    .build();

  const agentApp = await createAgentApp(agent);
  registerTestEntrypoints(agentApp.addEntrypoint);
  app = agentApp.app;
});

async function invoke(
  key: string,
  input: Record<string, unknown>
): Promise<{ output: Record<string, unknown> }> {
  const req = new Request(`http://localhost/entrypoints/${key}/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });
  const res = await app.fetch(req);
  if (!res.ok) {
    throw new Error(`invoke ${key} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { output: Record<string, unknown> };
}

describe('Integration: macro-events endpoint', () => {
  it('returns event feed with freshness metadata', async () => {
    const result = await invoke('macro-events', {});
    
    expect(result.output.event_feed).toBeDefined();
    expect(Array.isArray(result.output.event_feed)).toBe(true);
    
    const events = result.output.event_feed as Array<Record<string, unknown>>;
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].eventId).toBeDefined();
    expect(events[0].eventType).toBeDefined();
    expect(events[0].confidence).toBeDefined();
    expect(events[0].freshness).toBeDefined();
  });

  it('filters events by type', async () => {
    const result = await invoke('macro-events', {
      eventTypes: ['interest_rate'],
    });
    
    const events = result.output.event_feed as Array<Record<string, unknown>>;
    expect(events.length).toBe(1);
    expect(events.every(e => e.eventType === 'interest_rate')).toBe(true);
  });

  it('filters events by geography', async () => {
    const result = await invoke('macro-events', {
      geography: 'US',
    });
    
    const events = result.output.event_feed as Array<Record<string, unknown>>;
    expect(events.length).toBe(2);
    expect(events.every(e => e.geography === 'US')).toBe(true);
  });

  it('filters events by date range', async () => {
    const result = await invoke('macro-events', {
      startDate: '2024-02-01T00:00:00Z',
      endDate: '2024-03-31T23:59:59Z',
    });
    
    const events = result.output.event_feed as Array<Record<string, unknown>>;
    expect(events.length).toBe(2);
  });
});

describe('Integration: macro-impact-vector endpoint', () => {
  it('returns impact vector with confidence and freshness', async () => {
    const result = await invoke('macro-impact-vector', {
      eventId: 'evt_test_1',
    });
    
    expect(result.output.eventId).toBe('evt_test_1');
    expect(result.output.sectors).toBeDefined();
    expect(Array.isArray(result.output.sectors)).toBe(true);
    expect(result.output.horizon).toBe('medium');
    expect(result.output.freshness).toBeDefined();
  });

  it('includes sensitivity breakdown', async () => {
    const result = await invoke('macro-impact-vector', {
      eventId: 'evt_test_1',
    });
    
    expect(result.output.sensitivity_breakdown).toBeDefined();
    const breakdown = result.output.sensitivity_breakdown as Record<string, number>;
    expect(breakdown.interest_rate).toBe(0.8);
  });

  it('respects sector filter', async () => {
    const result = await invoke('macro-impact-vector', {
      eventId: 'evt_test_1',
      sectorSet: ['tech', 'finance'],
    });
    
    const sectors = result.output.sectors as Array<Record<string, unknown>>;
    expect(sectors.length).toBe(2);
    expect(sectors.every(s => ['tech', 'finance'].includes(s.sector as string))).toBe(true);
  });

  it('respects horizon parameter', async () => {
    const result = await invoke('macro-impact-vector', {
      eventId: 'evt_test_1',
      horizon: 'long',
    });
    
    expect(result.output.horizon).toBe('long');
  });
});

describe('Integration: macro-scenario-score endpoint', () => {
  it('returns scenario score with confidence band', async () => {
    const result = await invoke('macro-scenario-score', {
      eventId: 'evt_test_1',
      scenarioAssumptions: {
        inflation: 3.5,
        growth: 2.1,
      },
    });
    
    expect(result.output.eventId).toBe('evt_test_1');
    expect(result.output.scenario_score).toBeDefined();
    expect(typeof result.output.scenario_score).toBe('number');
    expect(result.output.confidence_band).toBeDefined();
    
    const band = result.output.confidence_band as { lower: number; upper: number };
    expect(band.lower).toBeDefined();
    expect(band.upper).toBeDefined();
    expect(band.lower).toBeLessThanOrEqual(band.upper);
  });

  it('returns sector-level scores', async () => {
    const result = await invoke('macro-scenario-score', {
      eventId: 'evt_test_1',
      scenarioAssumptions: { inflation: 2.0 },
      sectors: ['tech', 'finance'],
    });
    
    const sectors = result.output.sectors as Array<Record<string, unknown>>;
    expect(sectors.length).toBe(2);
    expect(sectors[0].sector).toBeDefined();
    expect(sectors[0].score).toBeDefined();
  });

  it('includes freshness metadata', async () => {
    const result = await invoke('macro-scenario-score', {
      eventId: 'evt_test_1',
      scenarioAssumptions: {},
    });
    
    expect(result.output.freshness).toBeDefined();
    const freshness = result.output.freshness as Record<string, unknown>;
    expect(freshness.dataTimestamp).toBeDefined();
    expect(freshness.ageSeconds).toBeDefined();
  });
});

describe('Integration: Response latency', () => {
  it('responds within 500ms for cached path', async () => {
    const start = Date.now();
    await invoke('macro-events', {});
    const elapsed = Date.now() - start;
    
    expect(elapsed).toBeLessThan(500);
  });
});

describe('Integration: Error handling', () => {
  it('returns error for non-existent event', async () => {
    await expect(
      invoke('macro-impact-vector', { eventId: 'evt_nonexistent' })
    ).rejects.toThrow();
  });
});
