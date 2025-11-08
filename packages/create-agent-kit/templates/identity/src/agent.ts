import { z } from "zod";
import { createAgentApp } from "@lucid-agents/agent-kit";
import {
  createAgentIdentity,
  getTrustConfig,
} from "@lucid-agents/agent-kit-identity";

// Bootstrap ERC-8004 identity (runs once at startup)
const identity = await createAgentIdentity({
  domain: process.env.AGENT_DOMAIN,
  autoRegister: process.env.IDENTITY_AUTO_REGISTER === "true",
});

if (identity.didRegister) {
  console.log("Registered agent on-chain!");
  console.log("Transaction:", identity.transactionHash);
} else if (identity.trust) {
  console.log("Found existing registration");
  console.log("Agent ID:", identity.record?.agentId);
}

// Extract trust config for the agent manifest
const trustConfig = getTrustConfig(identity);

const { app, addEntrypoint } = createAgentApp(
  {
    name: process.env.AGENT_NAME,
    version: process.env.AGENT_VERSION,
    description: process.env.AGENT_DESCRIPTION,
  },
  {
    useConfigPayments: true,
    trust: trustConfig,
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

// Access all three ERC-8004 registries if needed
export const identityClient = identity.clients?.identity;
export const reputationClient = identity.clients?.reputation;
export const validationClient = identity.clients?.validation;

export { app };
