/**
 * Full Integration Example - ERC-8004 with Agent Kit
 *
 * This example shows how to integrate ERC-8004 identity with agent-kit
 * to create an agent with verifiable on-chain identity.
 *
 * Prerequisites:
 * 1. Create a .env file with required variables
 * 2. Host your metadata at https://your-domain/.well-known/agent-metadata.json
 * 3. Run: bun run examples/full-integration.ts
 */

import { createAgentIdentity, getTrustConfig } from "../src/index.js";

// Note: Import from your actual agent-kit package
// import { createAgentApp } from "@lucid-dreams/agent-kit";

async function main() {
  console.log("🤖 Agent Kit + ERC-8004 Integration\n");

  // Step 1: Create ERC-8004 identity
  console.log("Step 1: Creating ERC-8004 identity...");
  const identity = await createAgentIdentity({
    autoRegister: true,
    trustModels: ["feedback", "inference-validation"],
  });

  console.log("✅", identity.status);

  if (identity.didRegister) {
    console.log("Transaction:", identity.transactionHash);
    console.log("\n📋 Important: Host your metadata at:");
    console.log(`  https://${identity.domain}/.well-known/agent-metadata.json`);
    console.log("\nMetadata should include:");
    console.log(
      JSON.stringify(
        {
          name: "My Agent",
          description: "An intelligent assistant",
          domain: identity.domain,
          capabilities: [
            {
              name: "chat",
              description: "Natural language conversation",
            },
          ],
          trustModels: ["feedback", "inference-validation"],
        },
        null,
        2
      )
    );
  }

  // Step 2: Extract trust config
  const trustConfig = getTrustConfig(identity);

  if (trustConfig) {
    console.log("\n✅ Trust config ready:");
    console.log(JSON.stringify(trustConfig, null, 2));
  }

  // Step 3: Create agent with trust metadata
  console.log("\n\nStep 2: Creating agent with identity...");

  // Uncomment when using with actual agent-kit:
  /*
  const { app, addEntrypoint } = createAgentApp(
    {
      name: "my-agent",
      version: "1.0.0",
      description: "Agent with ERC-8004 identity",
    },
    {
      trust: trustConfig, // Include ERC-8004 identity!
    }
  );

  // Step 4: Add your entrypoints
  addEntrypoint({
    name: "chat",
    description: "Chat with the agent",
    handler: async (req) => {
      return { message: "Hello! I have verifiable on-chain identity." };
    },
  });

  // Step 5: Start the agent
  console.log("✅ Agent ready with on-chain identity!");
  console.log("Manifest available at: /.well-known/agent.json");
  console.log("Identity verifiable on-chain via ERC-8004 registry");

  // Start server
  // app.listen(3000);
  */

  console.log("\n✨ Integration complete!");
  console.log("\nYour agent now has:");
  console.log("  • Verifiable on-chain identity");
  console.log("  • Trust metadata in manifest");
  console.log("  • Discoverable via ERC-8004 registry");
}

main().catch(console.error);
