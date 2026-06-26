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
 * Registers the Supplier Reliability entrypoint.
 *
 * @param addEntrypoint - Registration function from createAgentApp()
 */
export function registerEntrypoints(addEntrypoint: AddEntrypoint): void {
  // ------------------------------------------------------------------
  // `score` entrypoint — Bounty Issue #181
  //
  // Demonstrates a paid data agent that returns a reliability score
  // for a given supplier ID. This is a mock implementation that uses
  // a deterministic algorithm based on the supplier ID to ensure
  // consistent results for the same input.
  // ------------------------------------------------------------------
  addEntrypoint({
    key: 'score',
    description: 'Provides a reliability score (0-100) for a given supplier ID.',
    input: z.object({
      supplierId: z.string(),
    }),
    output: z.object({
      supplierId: z.string(),
      score: z.number().min(0).max(100),
      grade: z.enum(['A', 'B', 'C', 'D', 'F']),
      riskFactors: z.array(z.string()),
    }),
    price: '300', // As set in the CLI scaffold command: $0.0003 USDC
    async handler({ input }) {
      const { supplierId } = input;
      
      // Deterministic scoring based on supplierId hash
      let hash = 0;
      for (let i = 0; i < supplierId.length; i++) {
        const char = supplierId.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0; // Convert to 32bit integer
      }
      
      const score = (Math.abs(hash) % 70) + 30; // Score between 30 and 100

      let grade: 'A' | 'B' | 'C' | 'D' | 'F';
      if (score >= 90) grade = 'A';
      else if (score >= 80) grade = 'B';
      else if (score >= 70) grade = 'C';
      else if (score >= 60) grade = 'D';
      else grade = 'F';

      const riskFactors: string[] = [];
      if (score < 75) riskFactors.push('High defect rate reported in Q2.');
      if (score < 65) riskFactors.push('Recent supply chain disruptions.');

      return {
        output: {
          supplierId,
          score,
          grade,
          riskFactors,
        },
      };
    },
  });
}
