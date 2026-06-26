import type { EntrypointDef } from '@lucid-agents/types/core';
import { z } from 'zod';

/**
 * Type alias for the addEntrypoint function returned by createAgentApp.
 */
type AddEntrypoint = <
  TInput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  TOutput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
>(
  def: EntrypointDef<TInput, TOutput>
) => void;

/**
 * Registers the Geo Demand Pulse entrypoint.
 *
 * @param addEntrypoint - Registration function from createAgentApp()
 */
export function registerEntrypoints(addEntrypoint: AddEntrypoint): void {
  // ------------------------------------------------------------------
  // `pulse` entrypoint — Bounty Issue #182
  //
  // Demonstrates a paid data agent that returns a mock demand index
  // for a given geographic location (latitude/longitude).
  // ------------------------------------------------------------------
  addEntrypoint({
    key: 'pulse',
    description: 'Provides a Geo Demand Pulse Index (0-200) for a given coordinate.',
    input: z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      category: z.string().optional(),
    }),
    output: z.object({
      latitude: z.number(),
      longitude: z.number(),
      index: z.number().min(0).max(200),
      velocity: z.enum(['rising', 'stable', 'falling']),
      confidence: z.number().min(0).max(1),
    }),
    price: '300', // $0.0003 USDC
    async handler({ input }) {
      const { latitude, longitude } = input;
      
      // Deterministic scoring based on coordinates
      const seed = Math.floor(latitude * 100) + Math.floor(longitude * 100);
      const index = ((seed * 9301 + 49297) % 233280) / 233280 * 150 + 50; // Index between 50 and 200
      const confidence = ((seed * 49297 + 9301) % 233280) / 233280 * 0.3 + 0.7; // Confidence between 0.7 and 1.0

      let velocity: 'rising' | 'stable' | 'falling';
      const velocitySeed = (seed % 3);
      if (velocitySeed === 0) velocity = 'rising';
      else if (velocitySeed === 1) velocity = 'stable';
      else velocity = 'falling';

      return {
        output: {
          latitude,
          longitude,
          index: Math.round(index),
          velocity,
          confidence: parseFloat(confidence.toFixed(2)),
        },
      };
    },
  });
}
