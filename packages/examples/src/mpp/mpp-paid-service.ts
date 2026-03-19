import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { mpp, tempo } from '@lucid-agents/mpp';
import { z } from 'zod';

/**
 * MPP Paid Service Agent
 *
 * Demonstrates Machine Payments Protocol (MPP) integration with Lucid Agents.
 * MPP supports multiple payment methods (tempo, stripe, lightning, card)
 * via standard HTTP 402 challenges — unlike x402 which is blockchain-only.
 *
 * Run: bun run packages/examples/src/mpp/mpp-paid-service.ts
 *
 * Environment variables:
 *   MPP_TEMPO_CURRENCY     - Token address (e.g., pathUSD contract)
 *   MPP_TEMPO_RECIPIENT    - Recipient wallet address
 *   MPP_CURRENCY           - Default currency (default: 'usd')
 *   PORT                   - Server port (default: 3000)
 */

// ─── Option A: Configure MPP explicitly ────────────────────────────
// Use tempo.server() builder for typed, inline configuration.
const agent = await createAgent({
  name: 'mpp-paid-service',
  version: '1.0.0',
  description: 'Paid service agent using Machine Payments Protocol (MPP)',
})
  .use(http())
  .use(
    mpp({
      config: {
        // Accept Tempo stablecoin payments
        methods: [
          tempo.server({
            currency:
              process.env.MPP_TEMPO_CURRENCY ??
              '0x20c0000000000000000000000000000000000000', // pathUSD
            recipient:
              process.env.MPP_TEMPO_RECIPIENT ??
              '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // dev wallet
          }),
        ],
        currency: 'usd',
        defaultIntent: 'charge',
      },
    })
  )
  .build();

// ─── Option B: Configure MPP from environment ──────────────────────
// Uncomment below instead of the explicit config above:
//
// .use(mpp({ config: mppFromEnv() }))
//
// Uses env vars: MPP_TEMPO_CURRENCY, MPP_TEMPO_RECIPIENT, etc.

const { app, addEntrypoint } = await createAgentApp(agent);

// ─── Entrypoints ───────────────────────────────────────────────────

/**
 * Free entrypoint — no price, no payment required.
 */
addEntrypoint({
  key: 'health',
  description: 'Health check (free)',
  input: z.object({}),
  output: z.object({
    status: z.string(),
    timestamp: z.string(),
  }),
  handler: async () => ({
    output: {
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
  }),
});

/**
 * Paid entrypoint — $0.01 per call via MPP charge intent.
 *
 * When a client calls this without payment, the server returns:
 *   HTTP 402 Payment Required
 *   WWW-Authenticate: Payment id="...", method="tempo", intent="charge",
 *                     amount="0.01", currency="usd"
 *
 * The client then submits payment proof in the Payment header and retries.
 */
addEntrypoint({
  key: 'summarize',
  description: 'Summarize text — $0.01 per call',
  price: '0.01',
  input: z.object({
    text: z.string(),
  }),
  output: z.object({
    wordCount: z.number(),
    charCount: z.number(),
    preview: z.string(),
  }),
  handler: async ({ input }) => {
    const words = input.text.trim().split(/\s+/).filter(Boolean);
    const preview =
      input.text.length > 100 ? `${input.text.slice(0, 100)}…` : input.text;
    return {
      output: {
        wordCount: words.length,
        charCount: input.text.length,
        preview,
      },
    };
  },
});

/**
 * Paid entrypoint with per-mode pricing — different cost for invoke vs stream.
 */
addEntrypoint({
  key: 'analyze',
  description: 'Analyze text with word frequency — $0.05 invoke, $0.02 stream',
  price: { invoke: '0.05', stream: '0.02' },
  streaming: true,
  input: z.object({
    text: z.string(),
  }),
  output: z.object({
    frequencies: z.record(z.string(), z.number()),
    totalWords: z.number(),
  }),
  handler: async ({ input }) => {
    const words = input.text.toLowerCase().split(/\s+/).filter(Boolean);
    const freq: Record<string, number> = {};
    for (const word of words) {
      freq[word] = (freq[word] ?? 0) + 1;
    }
    return {
      output: { frequencies: freq, totalWords: words.length },
    };
  },
  stream: async ({ input }, emit) => {
    const words = input.text.toLowerCase().split(/\s+/).filter(Boolean);
    const freq: Record<string, number> = {};
    for (const word of words) {
      freq[word] = (freq[word] ?? 0) + 1;
      await emit({
        kind: 'delta',
        delta: JSON.stringify({ word, count: freq[word] }),
        mime: 'application/json',
      });
    }
    return {
      output: { frequencies: freq, totalWords: words.length },
    };
  },
});

/**
 * Paid entrypoint with custom MPP metadata — override intent and methods.
 *
 * The `metadata.mpp` field lets you customize the payment challenge per
 * entrypoint, overriding the agent-level defaults.
 */
addEntrypoint({
  key: 'premium-generate',
  description: 'Premium content generation — $1.00, accepts tempo or stripe',
  price: '1.00',
  metadata: {
    mpp: {
      intent: 'charge' as const,
      description: 'Premium AI content generation',
      // Restrict to specific payment methods for this entrypoint
      methods: ['tempo', 'stripe'],
    },
  },
  input: z.object({
    topic: z.string(),
    style: z.enum(['formal', 'casual', 'technical']).optional(),
  }),
  output: z.object({
    content: z.string(),
    style: z.string(),
  }),
  handler: async ({ input }) => {
    const style = input.style ?? 'casual';
    return {
      output: {
        content: `Generated ${style} content about: ${input.topic}`,
        style,
      },
    };
  },
});

// ─── Start Server ──────────────────────────────────────────────────

const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(
  `\nMPP Paid Service Agent ready at http://${server.hostname}:${server.port}\n`
);
console.log('Endpoints:');
console.log('  GET  /                                  → Landing page');
console.log('  GET  /.well-known/agent.json            → Agent manifest');
console.log('  POST /entrypoints/health/invoke          → Free health check');
console.log('  POST /entrypoints/summarize/invoke       → $0.01 (MPP charge)');
console.log('  POST /entrypoints/analyze/invoke          → $0.05 (MPP charge)');
console.log(
  '  POST /entrypoints/analyze/stream          → $0.02 (MPP session)'
);
console.log(
  '  POST /entrypoints/premium-generate/invoke → $1.00 (MPP charge)\n'
);
console.log('Payment methods: tempo (stablecoin)');
console.log(
  'Protocol: Machine Payments Protocol (HTTP 402 + WWW-Authenticate)\n'
);
