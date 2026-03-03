/**
 * x402 Paid Endpoint Example
 *
 * Demonstrates a minimal paid HTTP endpoint using x402 protocol.
 * The agent exposes two entrypoints:
 *   - /entrypoints/free-info/invoke   — free, no payment required
 *   - /entrypoints/premium-data/invoke — requires x402 payment
 *
 * Run with:
 *   PAYMENTS_RECEIVABLE_ADDRESS=0xYourAddress \
 *   FACILITATOR_URL=https://facilitator.daydreams.systems \
 *   NETWORK=eip155:84532 \
 *   bun run packages/examples/src/payments/x402-paid-endpoint.ts
 */

import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { z } from 'zod';

// ── Agent factory (exported for tests) ───────────────────────────────────────

export async function createPaidEndpointAgent() {
  // Only enable payments when environment is fully configured.
  // In tests, leave these env vars unset to skip the x402 paywall.
  const rawPaymentsConfig = paymentsFromEnv();
  // paymentsFromEnv() always returns an object; check if it's actually configured
  const paymentsConfig =
    rawPaymentsConfig?.facilitatorUrl && rawPaymentsConfig?.network
      ? rawPaymentsConfig
      : undefined;

  const agentBuilder = createAgent({
    name: 'x402-paid-endpoint',
    version: '1.0.0',
    description: 'Minimal example of a paid HTTP endpoint using x402',
  }).use(http());

  if (paymentsConfig) {
    agentBuilder.use(payments({ config: paymentsConfig }));
  }

  const agent = await agentBuilder.build();
  const { app, addEntrypoint } = await createAgentApp(agent);

  // ── Free entrypoint ────────────────────────────────────────────────────────

  addEntrypoint({
    key: 'free-info',
    description: 'Returns basic public information — no payment required',
    input: z.object({}),
    output: z.object({
      name: z.string(),
      version: z.string(),
      paidEndpoints: z.array(z.string()),
    }),
    handler: async () => {
      return {
        output: {
          name: 'x402-paid-endpoint',
          version: '1.0.0',
          paidEndpoints: ['premium-data', 'deep-analysis'],
        },
      };
    },
  });

  // ── $0.01 paid entrypoint ─────────────────────────────────────────────────

  addEntrypoint({
    key: 'premium-data',
    description: 'Returns premium data — costs $0.01 per call',
    price: paymentsConfig ? '0.01' : undefined,
    input: z.object({ query: z.string() }),
    output: z.object({
      data: z.string(),
      processedAt: z.string(),
    }),
    handler: async ctx => {
      return {
        output: {
          data: `Premium result for: "${ctx.input.query}"`,
          processedAt: new Date().toISOString(),
        },
      };
    },
  });

  // ── $0.10 paid entrypoint ─────────────────────────────────────────────────

  addEntrypoint({
    key: 'deep-analysis',
    description: 'Deep analysis — costs $0.10 per call',
    price: paymentsConfig ? '0.10' : undefined,
    input: z.object({ text: z.string() }),
    output: z.object({
      wordCount: z.number(),
      sentiment: z.string(),
      summary: z.string(),
    }),
    handler: async ctx => {
      const words = ctx.input.text.trim().split(/\s+/);
      return {
        output: {
          wordCount: words.length,
          sentiment: words.length > 10 ? 'positive' : 'neutral',
          summary: words.slice(0, 5).join(' ') + (words.length > 5 ? '…' : ''),
        },
      };
    },
  });

  return { app, agent };
}

// ── Start server ──────────────────────────────────────────────────────────────

if (
  typeof process !== 'undefined' &&
  process.argv[1]?.includes('x402-paid-endpoint')
) {
  const { app } = await createPaidEndpointAgent();
  const port = Number(process.env.PORT ?? 8787);

  if (typeof Bun !== 'undefined') {
    Bun.serve({ port, fetch: app.fetch });
    console.log(`x402 paid endpoint agent running at http://localhost:${port}`);
    console.log(`  GET  /.well-known/agent-card.json`);
    console.log(`  POST /entrypoints/free-info/invoke     (free)`);
    console.log(`  POST /entrypoints/premium-data/invoke  ($0.01)`);
    console.log(`  POST /entrypoints/deep-analysis/invoke ($0.10)`);
  }
}
