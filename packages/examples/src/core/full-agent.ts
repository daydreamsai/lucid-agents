/*
 * Full agent example demonstrating all major capabilities:
 *   1. HTTP extension for REST API
 *   2. Payments (x402) for monetization
 *   3. Identity (ERC-8004) for on-chain identity
 *   4. Streaming entrypoints
 *   5. Standard entrypoints
 *
 * Run with: bun run examples/full-agent.ts
 *
 * Environment variables (all optional):
 *   FACILITATOR_URL              - x402 facilitator (defaults to https://facilitator.daydreams.systems)
 *   PAYMENTS_RECEIVABLE_ADDRESS  - Wallet address to receive payments
 *   NETWORK                       - Network (e.g. base-sepolia, base, solana)
 *   AGENT_DOMAIN                  - Domain for ERC-8004 identity
 *   PRIVATE_KEY                   - Wallet private key for identity registration
 *   RPC_URL                       - RPC endpoint for blockchain
 *   CHAIN_ID                      - Chain ID (e.g. 84532 for Base Sepolia)
 *   PORT                          - Server port (defaults to 8787)
 */

import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/http';
import { http } from '@lucid-agents/http';
import { identity } from '@lucid-agents/identity';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { wallets, walletsFromEnv } from '@lucid-agents/wallet';
import { z } from 'zod';

async function main() {
  // 1. Build agent with extensions
  const agentBuilder = createAgent({
    name: 'full-agent-example',
    version: '1.0.0',
    description:
      'Demonstrates HTTP, payments, identity, and streaming capabilities',
  })
    .use(http())
    .use(wallets({ config: walletsFromEnv() }));

  // 2. Add payments if configured
  const paymentsConfig = paymentsFromEnv();
  if (paymentsConfig) {
    agentBuilder.use(payments({ config: paymentsConfig }));
  }

  // 3. Add identity if wallet is configured
  const walletsConfig = walletsFromEnv();
  if (walletsConfig?.agent) {
    agentBuilder.use(
      identity({
        config: {
          domain: process.env.AGENT_DOMAIN,
          autoRegister: process.env.REGISTER_IDENTITY === 'true',
          rpcUrl: process.env.RPC_URL,
          chainId: process.env.CHAIN_ID
            ? Number(process.env.CHAIN_ID)
            : undefined,
        },
      })
    );
  }

  // 4. Build the agent runtime
  const agent = await agentBuilder.build();

  // 5. Create Hono app
  const { app, addEntrypoint } = await createAgentApp(agent);

  // 6. Add simple echo entrypoint (with optional pricing)
  addEntrypoint({
    key: 'echo',
    description: 'Echo back the input text',
    input: z.object({ text: z.string() }),
    output: z.object({ text: z.string() }),
    price: paymentsConfig ? '1000' : undefined, // 0.001 USDC if payments enabled
    handler: async ctx => {
      const input = ctx.input as { text: string };
      return {
        output: { text: input.text },
        usage: { total_tokens: input.text.length },
      };
    },
  });

  // 7. Add streaming entrypoint (with optional pricing)
  addEntrypoint({
    key: 'stream',
    description: 'Stream characters back one by one',
    input: z.object({ prompt: z.string() }),
    streaming: true,
    price: paymentsConfig ? '2000' : undefined, // 0.002 USDC if payments enabled
    stream: async (ctx, emit) => {
      const input = ctx.input as { prompt: string };
      const prompt = input.prompt;

      // Stream each character
      for (const char of prompt) {
        await emit({
          kind: 'delta',
          delta: char,
          mime: 'text/plain',
        });
      }

      // Send final text chunk
      await emit({
        kind: 'text',
        text: `\nEchoed: ${prompt}`,
        mime: 'text/plain',
      });

      return {
        output: { done: true },
        usage: { total_tokens: prompt.length },
      };
    },
  });

  // 8. Start server
  const port = Number(process.env.PORT ?? 8787);
  const origin = process.env.AGENT_ORIGIN ?? `http://localhost:${port}`;

  if (typeof Bun !== 'undefined') {
    Bun.serve({
      port,
      fetch: app.fetch,
    });
    console.log(`[examples] Agent running at ${origin}`);
    console.log(
      `[examples] Try: curl ${origin}/entrypoints/echo/invoke -d '{"input":{"text":"hello"}}'`
    );
  } else {
    console.warn('[examples] Bun not available - server not started');
  }

  // 9. Fetch and display the agent card
  try {
    const cardResp = await fetch(`${origin}/.well-known/agent-card.json`);
    const card = await cardResp.json();
    console.log('[examples] Agent Card:', JSON.stringify(card, null, 2));
  } catch (error) {
    console.warn('[examples] Failed to fetch agent card:', error);
  }
}

main().catch(error => {
  console.error('[examples] Fatal error:', error);
  if (typeof process !== 'undefined') {
    process.exit(1);
  }
});
