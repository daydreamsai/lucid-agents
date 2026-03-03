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
import {
  createSolanaAgentIdentity,
  identitySolana,
  identitySolanaFromEnv,
} from '@lucid-agents/identity-solana';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { z } from 'zod';

async function main() {
  // Fail fast: SOLANA_PRIVATE_KEY is required for on-chain registration
  if (!process.env.SOLANA_PRIVATE_KEY) {
    throw new Error(
      'SOLANA_PRIVATE_KEY is required. Set it to a JSON array of numbers, e.g. [1,2,...,64].'
    );
  }

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
          SOLANA_PRIVATE_KEY: process.env.SOLANA_PRIVATE_KEY,
        }),
      })
    )
    .build();

  const { app, addEntrypoint } = await createAgentApp(agent);

  // Paid endpoint — analyze a creator's distribution strategy
  // After completing the task, submit reputation feedback to the requesting agent.
  addEntrypoint({
    key: 'analyze-distribution',
    description: 'Analyze a creator distribution strategy for $0.01 USDC',
    input: z.object({
      creatorHandle: z.string(),
      platform: z.string(),
      /** Optional: caller's Solana address to receive positive feedback after task */
      callerAddress: z.string().optional(),
    }),
    output: z.object({
      summary: z.string(),
      signals: z.array(z.string()),
      recommendation: z.string(),
    }),
    price: '0.01',
    async handler({ input }) {
      const result = {
        summary: `Distribution analysis for @${input.creatorHandle} on ${input.platform}`,
        signals: ['Shipping velocity: high', 'Narrative spread: building'],
        recommendation: 'Continue current cadence. Diversify to Farcaster.',
      };

      // Demonstration: give reputation feedback to the caller after task completion.
      // In production, resolve callerAddress from the payment proof or session context.
      if (input.callerAddress) {
        try {
          const { clients } = await createSolanaAgentIdentity(
            identitySolanaFromEnv({
              SOLANA_CLUSTER: process.env.SOLANA_CLUSTER ?? 'devnet',
              SOLANA_PRIVATE_KEY: process.env.SOLANA_PRIVATE_KEY!,
              AGENT_DOMAIN:
                process.env.AGENT_DOMAIN ?? 'solana-agent.example.com',
            })
          );
          await clients?.reputation.giveFeedback({
            targetAddress: input.callerAddress,
            score: 5,
            comment:
              'Task completed successfully via analyze-distribution entrypoint',
          });
          console.log(
            `[solana-identity] Reputation feedback sent to ${input.callerAddress}`
          );
        } catch (err) {
          // Non-fatal: log and continue; reputation is best-effort
          console.warn(`[solana-identity] Reputation feedback failed: ${err}`);
        }
      }

      return { output: result };
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
  console.log(
    `[solana-identity] Entrypoints: analyze-distribution ($0.01), health (free)`
  );

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
