/**
 * HTTP Multi-Route Example
 *
 * Demonstrates an agent with three routes at different price points:
 *   - status   — free
 *   - summarize — $0.01 per call
 *   - translate — $0.05 per call
 *
 * Run with:
 *   PAYMENTS_RECEIVABLE_ADDRESS=0xYourAddress \
 *   bun run packages/examples/src/core/http-multi-route.ts
 */

import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { z } from 'zod';

// ── Agent factory (exported for tests) ───────────────────────────────────────

export async function createMultiRouteAgent() {
  const rawPaymentsConfig = paymentsFromEnv();
  // paymentsFromEnv() always returns an object; check if it's actually configured
  const paymentsConfig =
    rawPaymentsConfig?.facilitatorUrl && rawPaymentsConfig?.network
      ? rawPaymentsConfig
      : undefined;

  const agentBuilder = createAgent({
    name: 'http-multi-route',
    version: '1.0.0',
    description: 'Agent with one free and two paid routes',
  }).use(http());

  if (paymentsConfig) {
    agentBuilder.use(payments({ config: paymentsConfig }));
  }

  const agent = await agentBuilder.build();
  const { app, addEntrypoint } = await createAgentApp(agent);

  // ── Route 1: Free status check ─────────────────────────────────────────────

  addEntrypoint({
    key: 'status',
    description: 'Health/status check — always free',
    input: z.object({}),
    output: z.object({
      ok: z.boolean(),
      uptime: z.number(),
      timestamp: z.string(),
    }),
    handler: async () => {
      return {
        output: {
          ok: true,
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
        },
      };
    },
  });

  // ── Route 2: Paid $0.01 — summarize ───────────────────────────────────────

  addEntrypoint({
    key: 'summarize',
    description: 'Summarize text — $0.01 per call',
    price: paymentsConfig ? '0.01' : undefined,
    input: z.object({ text: z.string() }),
    output: z.object({
      summary: z.string(),
      wordCount: z.number(),
      charCount: z.number(),
    }),
    handler: async ctx => {
      const { text } = ctx.input;
      const words = text.trim().split(/\s+/);
      const preview = words.slice(0, 20).join(' ');
      return {
        output: {
          summary: words.length > 20 ? `${preview}…` : preview,
          wordCount: words.length,
          charCount: text.length,
        },
      };
    },
  });

  // ── Route 3: Paid $0.05 — translate (stub) ────────────────────────────────

  addEntrypoint({
    key: 'translate',
    description: 'Translate text to target language — $0.05 per call',
    price: paymentsConfig ? '0.05' : undefined,
    input: z.object({
      text: z.string(),
      targetLanguage: z.string().default('es'),
    }),
    output: z.object({
      translated: z.string(),
      sourceLang: z.string(),
      targetLang: z.string(),
    }),
    handler: async ctx => {
      const { text, targetLanguage } = ctx.input;
      // Stub translation — replace with a real LLM/translation API in production
      return {
        output: {
          translated: `[${targetLanguage.toUpperCase()}] ${text}`,
          sourceLang: 'en',
          targetLang: targetLanguage,
        },
      };
    },
  });

  return { app, agent };
}

// ── Start server ──────────────────────────────────────────────────────────────

if (
  typeof process !== 'undefined' &&
  process.argv[1]?.includes('http-multi-route')
) {
  const { app } = await createMultiRouteAgent();
  const port = Number(process.env.PORT ?? 8787);

  if (typeof Bun !== 'undefined') {
    Bun.serve({ port, fetch: app.fetch });
    console.log(`Multi-route agent running at http://localhost:${port}`);
    console.log(`  POST /entrypoints/status/invoke     (free)`);
    console.log(`  POST /entrypoints/summarize/invoke  ($0.01)`);
    console.log(`  POST /entrypoints/translate/invoke  ($0.05)`);
  }
}
