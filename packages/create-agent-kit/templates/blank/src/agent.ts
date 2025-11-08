import { z } from "zod";
import { createAgentApp } from "@lucid-agents/agent-kit-hono";

// Adjust these options to configure payments, trust metadata, or AP2 metadata.
const agentOptions = {{AGENT_OPTIONS}};

const { app, addEntrypoint } = createAgentApp(
  {
    name: "{{APP_NAME}}",
    version: "{{AGENT_VERSION}}",
    description: "{{AGENT_DESCRIPTION}}",
  },
  agentOptions
);

addEntrypoint({
  key: "{{ENTRYPOINT_KEY}}",
  description: "{{ENTRYPOINT_DESCRIPTION}}",
  input: z.object({
    text: z.string().min(1, "Please provide some text to echo."),
  }),
{{ENTRYPOINT_PRICE_LINE}}
  handler: async ({ input }) => {
    return {
      output: {
        text: input.text,
      },
    };
  },
});

export { app };
