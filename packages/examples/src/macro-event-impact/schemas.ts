import { z } from 'zod';

/**
 * Shared schemas for Macro Event Impact Vector API
 */

// Request schemas
export const EventsRequestSchema = z.object({
  eventTypes: z.array(z.string()).optional(),
  geography: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const ImpactVectorRequestSchema = z.object({
  eventId: z.string(),
  sectorSet: z.array(z.string()).optional(),
  horizon: z.enum(['short', 'medium', 'long']).optional(),
});

export const ScenarioScoreRequestSchema = z.object({
  eventId: z.string(),
  scenarioAssumptions: z.record(z.string(), z.unknown()),
  sectors: z.array(z.string()).optional(),
});

// Response schemas
export const MacroEventSchema = z.object({
  eventId: z.string(),
  eventType: z.string(),
  title: z.string(),
  geography: z.string(),
  timestamp: z.string(),
  confidence: z.number().min(0).max(1),
  freshness: z.object({
    dataTimestamp: z.string(),
    ageSeconds: z.number(),
  }),
});

export const ImpactVectorSchema = z.object({
  eventId: z.string(),
  sectors: z.array(
    z.object({
      sector: z.string(),
      impact: z.number().min(-1).max(1),
      confidence: z.number().min(0).max(1),
    })
  ),
  horizon: z.string(),
  freshness: z.object({
    dataTimestamp: z.string(),
    ageSeconds: z.number(),
  }),
  sensitivity_breakdown: z.record(z.string(), z.number()).optional(),
});

export const ScenarioScoreSchema = z.object({
  eventId: z.string(),
  scenario_score: z.number(),
  confidence_band: z.object({
    lower: z.number(),
    upper: z.number(),
  }),
  sectors: z.array(
    z.object({
      sector: z.string(),
      score: z.number(),
    })
  ),
  freshness: z.object({
    dataTimestamp: z.string(),
    ageSeconds: z.number(),
  }),
});

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
