/**
 * Solana Identity Example
 *
 * Demonstrates:
 * 1. Registering an agent on devnet using @lucid-agents/identity-solana
 * 2. Serving a paid x402 endpoint
 * 3. Giving reputation feedback after task completion
 *
 * Usage:
 *   SOLANA_PRIVATE_KEY='[1,2,...,64]' AGENT_DOMAIN=my-agent.example.com bun src/solana-identity.ts
 */

import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { identitySolana, identitySolanaFromEnv } from '@lucid-agents/identity-solana';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { z } from 'zod';

async function main() {
  // Build agent with Solana identity
  const agent = await createAgent({
    name: 'solana-identity-example',
    version: '1.0.0',
    description: 'Example agent registered on 8004-Solana with paid endpoints',
  })
    .use(http())
    .use(
      payments({
        config: paymentsFromEnv(),
      })
    )
    .use(
      identitySolana({
        config: identitySolanaFromEnv({
          // Override: use devnet for this example
          SOLANA_CLUSTER: process.env.SOLANA_CLUSTER ?? 'devnet',
          AGENT_DOMAIN: process.env.AGENT_DOMAIN ?? 'solana-agent.example.com',
          REGISTER_IDENTITY: 'true',
          SOLANA_PRIVATE_KEY: process.env.SOLANA_PRIVATE_KEY ?? '',
        }),
      })
    )
    .build();

  const { app, addEntrypoint } = await createAgentApp(agent);

  // Paid endpoint — analyze a creator's distribution strategy
  addEntrypoint({
    key: 'analyze-distribution',
    description: 'Analyze a creator distribution strategy for $0.01 USDC',
    input: z.object({ creatorHandle: z.string(), platform: z.string() }),
    output: z.object({
      summary: z.string(),
      signals: z.array(z.string()),
      recommendation: z.string(),
    }),
    price: '0.01',
    async handler({ input }) {
      // Minimal implementation for example purposes
      return {
        output: {
          summary: `Distribution analysis for @${input.creatorHandle} on ${input.platform}`,
          signals: ['Shipping velocity: high', 'Narrative spread: building'],
          recommendation: 'Continue current cadence. Diversify to Farcaster.',
        },
      };
    },
  });

  // Free health endpoint
  addEntrypoint({
    key: 'health',
    description: 'Health check (free)',
    input: z.object({}),
    output: z.object({ status: z.string(), identity: z.string() }),
    async handler() {
      return {
        output: {
          status: 'ok',
          identity: 'solana:8004',
        },
      };
    },
  });

  const port = parseInt(process.env.PORT ?? '3099');
  console.log(`[solana-identity] Agent running on port ${port}`);
  console.log(`[solana-identity] Entrypoints: analyze-distribution ($0.01), health (free)`);

  return { app, port };
}

// Export for use as module
export { main };

// Run if executed directly
if (import.meta.main) {
  main().then(({ app, port }) => {
    Bun.serve({ port, fetch: app.fetch });
  });
}
