/*
 * Solana Identity Example
 *
 * This example demonstrates how to use @lucid-agents/identity-solana
 * to register a Lucid Agent on Solana blockchain.
 *
 * Run with: bun run src/solana-identity/solana-identity.ts
 *
 * Environment variables:
 * - SOLANA_PRIVATE_KEY: Private key for signing transactions
 * - SOLANA_CLUSTER: mainnet-beta | testnet | devnet (default: mainnet-beta)
 * - SOLANA_RPC_URL: RPC endpoint URL
 * - AGENT_DOMAIN: Agent domain for identity
 * - REGISTER_IDENTITY: Set to 'true' to auto-register
 */

import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { identitySolana, identitySolanaFromEnv } from '@lucid-agents/identity-solana';
import { createAgentApp } from '@lucid-agents/hono';
import { z } from 'zod';

async function main() {
  console.log('[example] Creating Lucid Agent with Solana Identity...\n');

  // Get Solana identity config from environment
  const solanaConfig = identitySolanaFromEnv();

  console.log('[example] Solana Identity Config:');
  console.log(`  - Cluster: ${solanaConfig.cluster || 'mainnet-beta'}`);
  console.log(`  - RPC URL: ${solanaConfig.rpcUrl || 'not set'}`);
  console.log(`  - Domain: ${solanaConfig.domain || 'not set'}`);
  console.log(`  - Auto Register: ${solanaConfig.autoRegister || false}`);
  console.log('');

  // Create agent with Solana identity
  const agent = await createAgent({
    name: 'solana-agent',
    version: '1.0.0',
    description: 'A Lucid Agent registered on Solana blockchain',
  })
    .use(http())
    .use(payments({ config: paymentsFromEnv() }))
    .use(
      identitySolana({
        config: {
          ...solanaConfig,
          registration: {
            name: 'Solana Agent Example',
            description: 'Demonstrating Solana identity with Lucid SDK',
            url: 'https://example.solana-agent.com',
            domain: solanaConfig.domain,
            x402Support: true,
          },
        },
      })
    )
    .build();

  console.log('[example] Agent created successfully!');

  // Check if identity was registered
  if (agent.trust?.solana?.identityAccount) {
    console.log(`[example] Solana Identity Account: ${agent.trust.solana.identityAccount}`);
  }

  if (agent.trust?.solana?.trustTier) {
    console.log(`[example] Trust Tier: ${agent.trust.solana.trustTier.tier}`);
  }

  // Create HTTP app with agent
  const { app, addEntrypoint } = await createAgentApp(agent);

  // Add a simple paid endpoint
  addEntrypoint({
    key: 'greet',
    description: 'Greets the user (paid endpoint)',
    price: '0.001',
    input: z.object({
      name: z.string().optional(),
    }),
    output: z.object({
      message: z.string(),
      timestamp: z.string(),
    }),
    handler: async ctx => {
      const input = ctx.input as { name?: string };
      const name = input.name ?? 'World';
      const timestamp = new Date().toISOString();

      console.log(`[agent] Greeting ${name} at ${timestamp}`);

      return {
        output: {
          message: `Hello, ${name}! Greetings from Solana identity!`,
          timestamp,
        },
      };
    },
  });

  const port = Number(process.env.PORT ?? 8787);

  console.log(`[example] Starting server on port ${port}...`);
  console.log(`[example] Agent card available at http://localhost:${port}/.well-known/agent-card.json`);

  Bun.serve({
    port,
    fetch: app.fetch,
  });

  console.log('[example] Server started!');
  console.log('');
  console.log('[example] Try these endpoints:');
  console.log(`  - GET http://localhost:${port}/.well-known/agent-card.json`);
  console.log(`  - POST http://localhost:${port}/v1/greet (requires x402 payment)`);
  console.log('');

  // Wait for server
  await new Promise(() => {});
}

main().catch(error => {
  console.error('[example] Fatal error:', error);
  process.exit(1);
});
