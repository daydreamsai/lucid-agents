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
      
      try {
        const response = await fetch(url, { method: 'HEAD' });
        const headers = response.headers;
        const now = Date.now();

        const lastModified = headers.get('last-modified');
        if (lastModified) {
          const stalenessMs = now - new Date(lastModified).getTime();
          const slaStatus = stalenessMs < 3600000 ? 'fresh' : 'stale'; // 1 hour threshold
          return { output: { url, slaStatus, stalenessMs, confidence: 0.9 } };
        }

        const cacheControl = headers.get('cache-control');
        if (cacheControl) {
          const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
          if (maxAgeMatch) {
            const maxAgeSec = parseInt(maxAgeMatch[1], 10);
            const age = parseInt(headers.get('age') || '0', 10);
            const stalenessMs = age * 1000;
            const slaStatus = age < maxAgeSec ? 'fresh' : 'stale';
            return { output: { url, slaStatus, stalenessMs, confidence: 0.8 } };
          }
        }
        
        return { output: { url, slaStatus: 'unknown', stalenessMs: -1, confidence: 0.5 } };
      } catch (error) {
        return { output: { url, slaStatus: 'unknown', stalenessMs: -1, confidence: 0.1 } };
      }
    },
  });
}
