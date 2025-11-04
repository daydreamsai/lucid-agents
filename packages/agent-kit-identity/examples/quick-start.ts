/**
 * Quick Start Example - ERC-8004 Agent Identity
 *
 * This example shows the simplest way to register your agent on the
 * ERC-8004 registry using environment variables.
 *
 * Prerequisites:
 * 1. Create a .env file with required variables (see .env.example)
 * 2. Run: bun run examples/quick-start.ts
 */

import { createAgentIdentity, registerAgent } from "../src/index.js";

async function main() {
  console.log("🤖 ERC-8004 Agent Identity - Quick Start\n");

  // Example 1: Simple registration with env vars
  console.log("📝 Example 1: Simple Registration");
  console.log("Using environment variables for configuration...\n");

  const identity = await createAgentIdentity({
    autoRegister: true,
  });

  console.log("Status:", identity.status);

  if (identity.didRegister) {
    console.log("✅ Agent registered successfully!");
    console.log("Transaction:", identity.transactionHash);
    console.log(
      "\n📋 Next step: Host your metadata at:",
      `https://${identity.domain}/.well-known/agent-metadata.json`
    );
  } else if (identity.trust) {
    console.log("✅ Found existing registration");
    console.log("Agent ID:", identity.record?.agentId);
  } else {
    console.log("ℹ️  No on-chain identity (agent will run without it)");
  }

  // Example 2: Explicit registration
  console.log("\n\n📝 Example 2: Explicit Registration");
  console.log("Forcing registration with registerAgent()...\n");

  const registration = await registerAgent({
    domain: "my-agent.example.com",
  });

  console.log("Status:", registration.status);
  if (registration.didRegister) {
    console.log("✅ Registered!");
    console.log("TX:", registration.transactionHash);
  }

  // Example 3: Custom configuration
  console.log("\n\n📝 Example 3: Custom Configuration");
  console.log("Using custom trust models and overrides...\n");

  const customIdentity = await createAgentIdentity({
    domain: "custom-agent.example.com",
    autoRegister: true,
    trustModels: ["feedback", "tee-attestation"],
    trustOverrides: {
      feedbackDataUri: "https://custom-agent.example.com/feedback.json",
    },
  });

  console.log("Status:", customIdentity.status);
  if (customIdentity.trust) {
    console.log("Trust models:", customIdentity.trust.trustModels);
    console.log("Feedback URI:", customIdentity.trust.feedbackDataUri);
  }

  console.log(
    "\n✨ Done! Check the full-integration example for usage with agent-kit."
  );
}

main().catch(console.error);
