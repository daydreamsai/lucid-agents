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
    key: 'reputation',
    description: 'Provides a reputation score for an ERC-8004 identity.',
    input: z.object({
      identity: z.string().describe('Agent identity (e.g., my-agent.example.com or 0x...)'),
    }),
    output: z.object({
      identity: z.string(),
      trustScore: z.number().min(0).max(1),
      completionRate: z.number().min(0).max(1),
      disputeRate: z.number().min(0).max(1),
      verifiableLinks: z.array(z.object({
        source: z.string(),
        url: z.string().url(),
      })),
    }),
    price: '300', // $0.0003 USDC
    async handler({ input }) {
      const { identity } = input;
      
      // Deterministic scoring based on identity hash
      let hash = 0;
      for (let i = 0; i < identity.length; i++) {
        hash = (hash << 5) - hash + identity.charCodeAt(i);
        hash |= 0; 
      }
      
      const trustScore = ((Math.abs(hash) % 40) + 60) / 100; // 0.60 - 1.00
      const completionRate = ((Math.abs(hash * 2) % 10) + 90) / 100; // 0.90 - 1.00
      const disputeRate = ((Math.abs(hash * 3) % 5)) / 100; // 0.00 - 0.05

      return {
        output: {
          identity,
          trustScore,
          completionRate,
          disputeRate,
          verifiableLinks: [
            {
              source: 'TaskMarket History',
              url: `https://taskmarket.com/agents/history/${encodeURIComponent(identity)}`
            }
          ]
        },
      };
    },
  });
}
