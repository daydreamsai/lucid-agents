/**
 * Hono SSE Streaming Example
 *
 * Demonstrates streaming responses via Hono's SSE support.
 * The agent exposes two streaming entrypoints:
 *   - char-stream  — emits each character as a delta event
 *   - count-stream — emits a numeric countdown then a final message
 *
 * Run with: bun run packages/examples/src/core/hono-streaming.ts
 *
 * Test with:
 *   curl -N -X POST http://localhost:8787/entrypoints/char-stream/stream \
 *     -H 'Content-Type: application/json' \
 *     -d '{"input":{"text":"Hello, Hono!"}}'
 */

import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { z } from 'zod';

// ── Agent factory (exported for tests) ───────────────────────────────────────

export async function createStreamingAgent() {
  const agent = await createAgent({
    name: 'hono-streaming',
    version: '1.0.0',
    description: 'Demonstrates SSE streaming via Hono',
  })
    .use(http())
    .build();

  const { app, addEntrypoint } = await createAgentApp(agent);

  // ── Entrypoint 1: character-by-character stream ───────────────────────────

  addEntrypoint({
    key: 'char-stream',
    description: 'Streams text character by character as SSE delta events',
    input: z.object({ text: z.string() }),
    output: z.object({ charCount: z.number() }),
    streaming: true,
    stream: async (ctx, emit) => {
      const { text } = ctx.input;

      for (const char of text) {
        await emit({ kind: 'delta', delta: char, mime: 'text/plain' });
      }

      // Final assembled text
      await emit({ kind: 'text', text, mime: 'text/plain' });

      return {
        output: { charCount: text.length },
        usage: { total_tokens: text.length },
      };
    },
  });

  // ── Entrypoint 2: countdown stream ───────────────────────────────────────

  addEntrypoint({
    key: 'count-stream',
    description: 'Streams a numeric countdown then a completion message',
    input: z.object({ from: z.number().int().min(1).max(20).default(5) }),
    output: z.object({ done: z.boolean() }),
    streaming: true,
    stream: async (ctx, emit) => {
      const { from } = ctx.input;

      for (let i = from; i >= 1; i--) {
        await emit({
          kind: 'delta',
          delta: `${i}… `,
          mime: 'text/plain',
        });
      }

      await emit({
        kind: 'text',
        text: 'Liftoff! 🚀',
        mime: 'text/plain',
      });

      return {
        output: { done: true },
        usage: { total_tokens: from },
      };
    },
  });

  // ── Entrypoint 3: word-by-word stream ─────────────────────────────────────

  addEntrypoint({
    key: 'word-stream',
    description: 'Streams text word by word',
    input: z.object({ text: z.string() }),
    output: z.object({ wordCount: z.number() }),
    streaming: true,
    stream: async (ctx, emit) => {
      const words = ctx.input.text.trim().split(/\s+/);

      for (const word of words) {
        await emit({ kind: 'delta', delta: word + ' ', mime: 'text/plain' });
      }

      await emit({
        kind: 'text',
        text: ctx.input.text,
        mime: 'text/plain',
      });

      return {
        output: { wordCount: words.length },
        usage: { total_tokens: words.length },
      };
    },
  });

  return { app, agent };
}

// ── Start server ──────────────────────────────────────────────────────────────

if (
  typeof process !== 'undefined' &&
  process.argv[1]?.includes('hono-streaming')
) {
  const { app } = await createStreamingAgent();
  const port = Number(process.env.PORT ?? 8787);

  if (typeof Bun !== 'undefined') {
    Bun.serve({ port, fetch: app.fetch });
    console.log(`Hono streaming agent running at http://localhost:${port}`);
    console.log(`  POST /entrypoints/char-stream/stream  — char-by-char SSE`);
    console.log(`  POST /entrypoints/count-stream/stream — countdown SSE`);
    console.log(`  POST /entrypoints/word-stream/stream  — word-by-word SSE`);
  }
}
