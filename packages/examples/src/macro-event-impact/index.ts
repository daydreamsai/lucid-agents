import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { z } from 'zod';
import {
  EventsRequestSchema,
  ImpactVectorRequestSchema,
  ScenarioScoreRequestSchema,
  MacroEventSchema,
  ImpactVectorSchema,
  ScenarioScoreSchema,
} from './schemas';
import {
  filterEventsByType,
  filterEventsByGeography,
  filterEventsByDateRange,
  calculateImpactVector,
  calculateSensitivityBreakdown,
  calculateScenarioScore,
  calculateConfidenceBand,
  type MacroEvent,
} from './logic';

/**
 * Macro Event Impact Vector API for Agents
 * 
 * Provides paid endpoints for macro event data, impact vectors,
 * and scenario scoring with x402 payment middleware.
 * 
 * Required environment variables:
 *   - FACILITATOR_URL - x402 facilitator endpoint
 *   - PAYMENTS_RECEIVABLE_ADDRESS - Address that receives payments
 *   - NETWORK - Network identifier (e.g., base-sepolia)
 */

// Mock event database
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
  
  return {
    dataTimestamp,
    ageSeconds,
  };
}

type AddEntrypointFn = ReturnType<typeof createAgentApp>['addEntrypoint'];

export function registerMacroEntrypoints(addEntrypoint: AddEntrypointFn) {
  /**
   * GET /v1/macro/events - $0.01 per call
   */
  addEntrypoint({
    key: 'macro-events',
    description: 'Get macro event feed with filters',
    price: '0.01',
    input: EventsRequestSchema,
    output: z.object({
      event_feed: z.array(MacroEventSchema),
    }),
    handler: async ctx => {
      let events = mockEvents;
      
      events = filterEventsByType(events, ctx.input.eventTypes);
      events = filterEventsByGeography(events, ctx.input.geography);
      events = filterEventsByDateRange(
        events,
        ctx.input.startDate,
        ctx.input.endDate
      );
      
      const event_feed = events.map(event => ({
        ...event,
        freshness: calculateFreshness(event.timestamp),
      }));
      
      return { output: { event_feed } };
    },
  });

  /**
   * GET /v1/macro/impact-vectors - $0.02 per call
   */
  addEntrypoint({
    key: 'macro-impact-vector',
    description: 'Get impact vector for a macro event',
    price: '0.02',
    input: ImpactVectorRequestSchema,
    output: ImpactVectorSchema,
    handler: async ctx => {
      const event = mockEvents.find(e => e.eventId === ctx.input.eventId);
      if (!event) {
        throw new Error(`Event not found: ${ctx.input.eventId}`);
      }
      
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

  /**
   * POST /v1/macro/scenario-score - $0.03 per call
   */
  addEntrypoint({
    key: 'macro-scenario-score',
    description: 'Calculate scenario score for a macro event',
    price: '0.03',
    input: ScenarioScoreRequestSchema,
    output: ScenarioScoreSchema,
    handler: async ctx => {
      const event = mockEvents.find(e => e.eventId === ctx.input.eventId);
      if (!event) {
        throw new Error(`Event not found: ${ctx.input.eventId}`);
      }
      
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

// Main entry point
if (import.meta.main) {
  const agent = await createAgent({
    name: 'macro-event-impact',
    version: '1.0.0',
    description: 'Macro Event Impact Vector API for Agents',
  })
    .use(http())
    .use(payments({ config: paymentsFromEnv() }))
    .build();

  const { app, addEntrypoint } = await createAgentApp(agent);
  registerMacroEntrypoints(addEntrypoint);

  const port = Number(process.env.PORT ?? 3002);

  const server = Bun.serve({
    port,
    fetch: app.fetch,
  });

  console.log(`Macro Event Impact API ready at http://${server.hostname}:${server.port}`);
  console.log(`   - /entrypoints/macro-events/invoke - $0.01 per call`);
  console.log(`   - /entrypoints/macro-impact-vector/invoke - $0.02 per call`);
  console.log(`   - /entrypoints/macro-scenario-score/invoke - $0.03 per call`);
  console.log(`   - /.well-known/agent.json - Agent manifest`);
}
