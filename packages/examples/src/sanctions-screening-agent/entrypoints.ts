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
    key: 'screen',
    description: 'Screens an entity against sanctions and PEP lists.',
    input: z.object({
      name: z.string().optional(),
      address: z.string().optional(),
    }),
    output: z.object({
      isSanctioned: z.boolean(),
      isPEP: z.boolean(),
      matchConfidence: z.number().min(0).max(1),
      listsChecked: z.array(z.string()),
    }),
    price: '300', // $0.0003 USDC
    async handler({ input }) {
      const { name, address } = input;
      const entity = name || address;
      if (!entity) {
        throw new Error('At least one of `name` or `address` must be provided.');
      }
      
      // Deterministic scoring based on entity hash
      let hash = 0;
      for (let i = 0; i < entity.length; i++) {
        hash = (hash << 5) - hash + entity.charCodeAt(i);
        hash |= 0; 
      }
      
      // Mock result: 5% chance of being sanctioned, 10% chance of being a PEP
      const isSanctioned = (Math.abs(hash) % 100) < 5;
      const isPEP = (Math.abs(hash * 2) % 100) < 10;
      const matchConfidence = isSanctioned || isPEP ? ((Math.abs(hash * 3) % 20) + 80) / 100 : 0;

      return {
        output: {
          isSanctioned,
          isPEP,
          matchConfidence,
          listsChecked: ['OFAC', 'UN', 'EU', 'WorldBank'],
        },
      };
    },
  });
}
