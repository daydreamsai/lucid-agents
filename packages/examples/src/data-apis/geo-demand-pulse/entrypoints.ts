/**
 * Geo Demand Pulse Index - Entrypoint Registration
 */
import type { AgentRuntime, EntrypointDef } from '@lucid-agents/types/core';
import { z } from 'zod';

import { DemandDataError,handleAnomalies, handleDemandIndex, handleTrend } from './handlers';
import { AnomaliesInputSchema, AnomaliesOutputSchema, DemandIndexInputSchema, DemandIndexOutputSchema, TrendInputSchema, TrendOutputSchema } from './schemas';

type AddEntrypoint = <TInput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined, TOutput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined>(def: EntrypointDef<TInput, TOutput>) => void;

const PRICING = {
  demandIndex: process.env.PRICE_DEMAND_INDEX || '0.001',
  trend: process.env.PRICE_TREND || '0.002',
  anomalies: process.env.PRICE_ANOMALIES || '0.003',
};

export function registerEntrypoints(addEntrypoint: AddEntrypoint, _runtime: AgentRuntime): void {
  addEntrypoint({
    key: 'demand-index',
    description: 'Get localized demand index with velocity and confidence intervals for a geographic area',
    price: PRICING.demandIndex || undefined,
    input: DemandIndexInputSchema,
    output: DemandIndexOutputSchema,
    async handler({ input }) {
      try {
        const result = await handleDemandIndex(input);
        return { output: result };
      } catch (error) {
        if (error instanceof DemandDataError) throw error;
        throw new DemandDataError('INTERNAL_ERROR', 'Failed to compute demand index');
      }
    },
  });

  addEntrypoint({
    key: 'demand-trend',
    description: 'Get demand trend analysis with direction, strength, and historical data points',
    price: PRICING.trend || undefined,
    input: TrendInputSchema,
    output: TrendOutputSchema,
    async handler({ input }) {
      try {
        const result = await handleTrend(input);
        return { output: result };
      } catch (error) {
        if (error instanceof DemandDataError) throw error;
        throw new DemandDataError('INTERNAL_ERROR', 'Failed to compute trend');
      }
    },
  });

  addEntrypoint({
    key: 'demand-anomalies',
    description: 'Detect demand anomalies with severity flags and baseline statistics',
    price: PRICING.anomalies || undefined,
    input: AnomaliesInputSchema,
    output: AnomaliesOutputSchema,
    async handler({ input }) {
      try {
        const result = await handleAnomalies(input);
        return { output: result };
      } catch (error) {
        if (error instanceof DemandDataError) throw error;
        throw new DemandDataError('INTERNAL_ERROR', 'Failed to detect anomalies');
      }
    },
  });
}
