import { z } from "zod";
import {
  AgentKitConfig,
  createAgentApp,
} from "@lucid-agents/agent-kit";
import { createAgentIdentity, getTrustConfig } from "@lucid-agents/agent-kit-identity";

// Bootstrap ERC-8004 identity (runs once at startup)
const identity = await createAgentIdentity({
  domain: process.env.AGENT_DOMAIN || "{{AGENT_DOMAIN}}",
  autoRegister: {{AUTO_REGISTER}},
});

if (identity.didRegister) {
  console.log("✅ Registered agent on-chain!");
  console.log("Transaction:", identity.transactionHash);
} else if (identity.trust) {
  console.log("✅ Found existing registration");
  console.log("Agent ID:", identity.record?.agentId);
}

// Extract trust config for the agent manifest
const trustConfig = getTrustConfig(identity);

// Payment configuration
const configOverrides: AgentKitConfig = {
  payments: {
    facilitatorUrl:
      (process.env.FACILITATOR_URL as any) ??
      "https://facilitator.daydreams.systems",
    payTo:
      (process.env.ADDRESS as `0x${string}`) ??
      "0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429",
    network: (process.env.NETWORK as any) ?? "base-sepolia",
    defaultPrice: process.env.DEFAULT_PRICE ?? "1000",
  },
};

const { app, addEntrypoint } = createAgentApp(
  {
    name: "{{APP_NAME}}",
    version: "{{AGENT_VERSION}}",
    description: "{{AGENT_DESCRIPTION}}",
  },
  {
    config: configOverrides,
    trust: trustConfig,
  }
);

addEntrypoint({
  key: "{{ENTRYPOINT_KEY}}",
  description: "{{ENTRYPOINT_DESCRIPTION}}",
  input: z.object({
    text: z.string().min(1, "Please provide some text."),
  }),
  // Price is read from DEFAULT_PRICE environment variable
  handler: async ({ input }) => {
    return {
      output: {
        text: input.text,
        processed: true,
      },
    };
  },
});

// Access all three ERC-8004 registries if needed
export const identityClient = identity.clients?.identity;
export const reputationClient = identity.clients?.reputation;
export const validationClient = identity.clients?.validation;

export { app };

