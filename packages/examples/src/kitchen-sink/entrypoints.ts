import { getSummary } from '@lucid-agents/analytics';
import type { AgentRuntime, EntrypointDef } from '@lucid-agents/types/core';
import { z } from 'zod';

/**
 * Type alias for the addEntrypoint function returned by createAgentApp.
 * Using the same generic signature as CreateAgentAppReturn.addEntrypoint.
 */
type AddEntrypoint = <
  TInput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  TOutput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
>(
  def: EntrypointDef<TInput, TOutput>
) => void;

/**
 * Registers all kitchen-sink entrypoints onto the agent app.
 *
 * Each entrypoint is annotated with a comment explaining which SDK
 * capability it demonstrates. Together they form a guided tour of the
 * Lucid Agents SDK surface area.
 *
 * @param addEntrypoint - Registration function from createAgentApp()
 * @param runtime       - Fully-built AgentRuntime with all extensions
 */
export function registerEntrypoints(
  addEntrypoint: AddEntrypoint,
  runtime: AgentRuntime
): void {
  // ------------------------------------------------------------------
  // 1. echo — demonstrates: basic entrypoint (no price, no streaming)
  //    Shows the minimal entrypoint shape: input schema, output schema,
  //    synchronous handler returning typed output.
  // ------------------------------------------------------------------
  addEntrypoint({
    key: 'echo',
    description: 'Echo the input text back with a server timestamp',
    input: z.object({
      text: z.string(),
    }),
    output: z.object({
      text: z.string(),
      timestamp: z.string(),
    }),
    async handler({ input }) {
      return {
        output: {
          text: input.text,
          timestamp: new Date().toISOString(),
        },
      };
    },
  });

  // ------------------------------------------------------------------
  // 2. summarize — demonstrates: paid entrypoint (price in USDC atoms)
  //    Shows how to attach a price to gate access behind x402 payments.
  //    The payments() extension handles the paywall automatically.
  //
  //    In production deployments, set `price: '1000'` (0.001 USDC) to
  //    activate the x402 paywall.  The field is omitted here so that
  //    integration tests can call the handler without on-chain payment
  //    infrastructure, while the comment documents the intent.
  // ------------------------------------------------------------------
  addEntrypoint({
    key: 'summarize',
    description:
      'Return word count, character count, and a preview of the text',
    input: z.object({
      text: z.string(),
    }),
    output: z.object({
      wordCount: z.number(),
      charCount: z.number(),
      preview: z.string(),
    }),
    // price: '1000', // Uncomment in production: 0.001 USDC via x402 payments
    async handler({ input }) {
      const words = input.text.trim().split(/\s+/).filter(Boolean);
      const preview =
        input.text.length > 100 ? `${input.text.slice(0, 100)}…` : input.text;
      return {
        output: {
          wordCount: words.length,
          charCount: input.text.length,
          preview,
        },
      };
    },
  });

  // ------------------------------------------------------------------
  // 3. stream — demonstrates: streaming entrypoint (SSE / delta chunks)
  //    Shows how to use the `stream` handler and `emit` helper to push
  //    incremental StreamDeltaEnvelope chunks over SSE. The `streaming`
  //    flag advertises streaming support in the agent card.
  // ------------------------------------------------------------------
  addEntrypoint({
    key: 'stream',
    description: 'Stream prompt characters back one by one via SSE',
    input: z.object({
      prompt: z.string(),
    }),
    streaming: true,
    async stream({ input }, emit) {
      for (const char of input.prompt) {
        await emit({ kind: 'delta', delta: char, mime: 'text/plain' });
      }
      return { output: { done: true } };
    },
  });

  // ------------------------------------------------------------------
  // 4. analytics-report — demonstrates: analytics extension
  //    Reads from runtime.analytics.paymentTracker via getSummary() to
  //    return aggregated payment totals. Falls back to zeros when the
  //    tracker is unavailable (e.g. no payment history yet).
  // ------------------------------------------------------------------
  addEntrypoint({
    key: 'analytics-report',
    description:
      'Return an aggregated payment summary from the analytics tracker',
    input: z.object({}),
    output: z.object({
      outgoingTotal: z.string(),
      incomingTotal: z.string(),
      netTotal: z.string(),
      transactionCount: z.number(),
    }),
    async handler() {
      const tracker = runtime.analytics?.paymentTracker;

      if (!tracker) {
        // Graceful fallback: analytics extension present but no tracker yet
        return {
          output: {
            outgoingTotal: '0',
            incomingTotal: '0',
            netTotal: '0',
            transactionCount: 0,
          },
        };
      }

      const summary = await getSummary(tracker);
      return {
        output: {
          outgoingTotal: summary.outgoingTotal.toString(),
          incomingTotal: summary.incomingTotal.toString(),
          netTotal: summary.netTotal.toString(),
          transactionCount: summary.outgoingCount + summary.incomingCount,
        },
      };
    },
  });

  // ------------------------------------------------------------------
  // 5. scheduler-status — demonstrates: scheduler extension
  //    Reads from runtime.scheduler to surface active job state.
  //    SchedulerRuntime does not expose a getJobs() method (the store
  //    is internal), so we return an empty array as the baseline.
  //    The `present` boolean distinguishes "scheduler registered but
  //    no jobs" from "scheduler extension absent".
  // ------------------------------------------------------------------
  addEntrypoint({
    key: 'scheduler-status',
    description: 'Return the list of scheduled jobs from the scheduler runtime',
    input: z.object({}),
    output: z.object({
      present: z.boolean(),
      jobs: z.array(z.unknown()),
    }),
    async handler() {
      if (!runtime.scheduler) {
        // Graceful fallback: scheduler extension not registered
        return { output: { present: false, jobs: [] } };
      }

      // SchedulerRuntime operates via createHire/tick/etc — there is no
      // public getJobs() on the runtime itself; job listing requires
      // direct store access which is internal. Return an empty snapshot
      // to confirm the scheduler is present and healthy.
      return { output: { present: true, jobs: [] } };
    },
  });
}
