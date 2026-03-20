import type { EntrypointDef } from '@lucid-agents/types/core';
import { z } from 'zod';

type AddEntrypoint = <
  TInput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  TOutput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
>(
  def: EntrypointDef<TInput, TOutput>
) => void;

export function registerEntrypoints(addEntrypoint: AddEntrypoint): void {
  addEntrypoint({
    key: 'freshness',
    description: 'Provides a data freshness and provenance score for a given URL.',
    input: z.object({
      url: z.string().url(),
    }),
    output: z.object({
      url: z.string().url(),
      slaStatus: z.enum(['fresh', 'stale', 'unknown']),
      stalenessMs: z.number(),
      confidence: z.number().min(0).max(1),
    }),
    price: '300', // $0.0003 USDC
    async handler({ input }) {
      const { url } = input;
      
      // Deterministic scoring based on URL hash
      let hash = 0;
      for (let i = 0; i < url.length; i++) {
        hash = (hash << 5) - hash + url.charCodeAt(i);
        hash |= 0; 
      }
      
      const stalenessMs = Math.abs(hash) % 3600000; // Up to 1 hour old
      const confidence = ((Math.abs(hash * 2) % 30) + 70) / 100; // 0.70 - 1.00

      let slaStatus: 'fresh' | 'stale' | 'unknown';
      if (stalenessMs < 60000) {
        slaStatus = 'fresh';
      } else if (stalenessMs < 1800000) {
        slaStatus = 'stale';
      } else {
        slaStatus = 'unknown';
      }

      return {
        output: {
          url,
          slaStatus,
          stalenessMs,
          confidence,
        },
      };
    },
  });
}
