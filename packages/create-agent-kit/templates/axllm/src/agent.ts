import { z } from "zod";
import {
  type AgentKitConfig,
  createAxLLMClient,
} from "@lucid-agents/agent-kit";
import { createAgentApp } from "@lucid-agents/agent-kit-hono";

const axClient = createAxLLMClient({
  logger: {
    warn(message, error) {
      if (error) {
        console.warn(`[examples] ${message}`, error);
      } else {
        console.warn(`[examples] ${message}`);
      }
    },
  },
});

if (!axClient.isConfigured()) {
  console.warn(
    "[examples] Ax LLM provider not configured — falling back to scripted streaming output."
  );
}

const configOverrides: AgentKitConfig = {
  payments: {
    facilitatorUrl:
      (process.env.FACILITATOR_URL as any) ??
      "https://facilitator.daydreams.systems",
    payTo:
      (process.env.PAY_TO as `0x${string}`) ??
      "0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429",
    network: (process.env.NETWORK as any) ?? "base",
    defaultPrice: process.env.DEFAULT_PRICE ?? "0.1",
  },
};

const { app, addEntrypoint } = createAgentApp(
  {
    name: "framework-stream-agent",
    version: "0.0.3",
    description:
      "Minimal example showing how to bridge an Ax LLM streaming integration into @lucid-dreams/agent-kit.",
  },
  {
    config: configOverrides,
  }
);

addEntrypoint({
  key: "framework-stream",
  description:
    "Proxy an external Ax-compatible agent with streaming support backed by @ax-llm/ax.",
  input: z.object({
    prompt: z
      .string()
      .describe("User prompt to forward to the Ax-backed agent"),
  }),
  output: z.object({ text: z.string() }),
  streaming: true,
  async handler(ctx) {
    const prompt = String(ctx.input.prompt ?? "").trim();
    const result = await axClient.chat({ prompt, stream: false });
    return {
      output: result.text ? { text: result.text } : undefined,
      model: result.model,
    };
  },
  async stream(ctx, emit) {
    const prompt = String(ctx.input.prompt ?? "").trim();
    const result = await axClient.chat({
      prompt,
      stream: true,
      emit: async (delta) => {
        if (!delta) return;
        await emit({ kind: "delta", delta, mime: "text/plain" });
      },
    });

    if (result.text) {
      await emit({
        kind: "text",
        text: result.text,
        mime: "text/plain",
      });
    }

    return {
      output: result.text ? { text: result.text } : undefined,
      model: result.model,
    };
  },
});

export { app };
