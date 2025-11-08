import { z } from "zod";
import {
  AgentKitConfig,
  createAgentApp,
  createAxLLMClient,
} from "@lucid-agents/agent-kit";
import { flow } from "@ax-llm/ax";

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

const configOverrides: AgentKitConfig = {
  payments: {
    facilitatorUrl: process.env.PAYMENTS_FACILITATOR_URL as any,
    payTo: process.env.PAYMENTS_RECEIVABLE_ADDRESS as `0x${string}`,
    network: process.env.PAYMENTS_NETWORK as any,
    defaultPrice: process.env.PAYMENTS_DEFAULT_PRICE,
  },
};

const { app, addEntrypoint } = createAgentApp(
  {
    name: process.env.AGENT_NAME,
    version: process.env.AGENT_VERSION,
    description: process.env.AGENT_DESCRIPTION,
  },
  {
    config: configOverrides,
    useConfigPayments: true,
  }
);

addEntrypoint({
  key: "echo",
  description: "Echo input text",
  input: z.object({
    text: z.string().min(1, "Please provide some text."),
  }),
  handler: async ({ input }) => {
    return {
      output: {
        text: input.text,
      },
    };
  },
});

export { app };
