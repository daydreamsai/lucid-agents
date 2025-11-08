import { createTanStackRuntime } from "@lucid-agents/agent-kit-tanstack";
import type { CreateAgentHttpOptions } from "@lucid-agents/agent-kit";
import { z } from "zod";

const agentOptions: CreateAgentHttpOptions = {{AGENT_OPTIONS}};

const tanstack = createTanStackRuntime(
  {
    name: "{{APP_NAME}}",
    version: "{{AGENT_VERSION}}",
    description: "{{AGENT_DESCRIPTION}}"
  },
  agentOptions
);

const { runtime, handlers } = tanstack;

runtime.addEntrypoint({
  key: "{{ENTRYPOINT_KEY}}",
  description: "{{ENTRYPOINT_DESCRIPTION}}",
  input: z.object({
    text: z.string().min(1)
  }),
  output: z.object({
    text: z.string()
  }),
{{ENTRYPOINT_PRICE_LINE}}
  handler: async ({ input }) => ({
    output: { text: input.text }
  })
});

runtime.addEntrypoint({
  key: "count",
  description: "Stream incremental numbers up to the provided limit",
  input: z.object({
    limit: z.number().int().min(1).max(20),
  }),
  stream: async ({ input, signal }, emit) => {
    const typedInput = input as { limit: number };
    const delay = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));

    for (let i = 1; i <= typedInput.limit; i++) {
      if (signal.aborted) {
        throw new Error("Stream aborted by client");
      }
      await emit({
        kind: "text",
        text: `Count: ${i}`,
        metadata: { index: i },
      });
      await delay(300);
    }

    return {
      status: "succeeded",
      metadata: {
        total: typedInput.limit,
      },
    };
  },
});


const { agent } = runtime;

export { agent, handlers, runtime };
