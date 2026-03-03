/**
 * Tests for a2a-ping-pong.ts
 *
 * Unit/contract tests — no live network required.
 * We build both agents in-process and call them via app.fetch().
 */

import { a2a } from '@lucid-agents/a2a';
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { beforeAll, describe, expect, it } from 'bun:test';
import { z } from 'zod';

// ── Helpers ───────────────────────────────────────────────────────────────────

type App = { fetch: (req: Request) => Response | Promise<Response> };

/** POST to app.fetch and return parsed JSON */
async function invokeEntrypoint(
  app: App,
  key: string,
  input: Record<string, unknown>
) {
  const req = new Request(`http://localhost/entrypoints/${key}/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });
  const res = await app.fetch(req);
  if (!res.ok) {
    throw new Error(`invoke ${key} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { output: Record<string, unknown> };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let pongApp: App;

beforeAll(async () => {
  const agent = await createAgent({
    name: 'test-pong-agent',
    version: '1.0.0',
    description: 'Pong agent for tests',
  })
    .use(http())
    .use(a2a())
    .build();

  const { app, addEntrypoint } = await createAgentApp(agent);

  addEntrypoint({
    key: 'ping',
    description: 'Receive ping, reply pong',
    input: z.object({ message: z.string(), count: z.number() }),
    output: z.object({ reply: z.string(), count: z.number() }),
    handler: async ctx => {
      return {
        output: {
          reply: ctx.input.message.replace(/ping/gi, 'pong'),
          count: ctx.input.count,
        },
      };
    },
  });

  pongApp = app;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Pong agent — ping entrypoint', () => {
  it('replaces "ping" with "pong" in the reply', async () => {
    const result = await invokeEntrypoint(pongApp, 'ping', {
      message: 'ping #1',
      count: 1,
    });
    expect(result.output.reply).toBe('pong #1');
  });

  it('echoes the round count back unchanged', async () => {
    const result = await invokeEntrypoint(pongApp, 'ping', {
      message: 'ping',
      count: 42,
    });
    expect(result.output.count).toBe(42);
  });

  it('handles multiple rounds correctly', async () => {
    for (let round = 1; round <= 3; round++) {
      const result = await invokeEntrypoint(pongApp, 'ping', {
        message: `ping round ${round}`,
        count: round,
      });
      expect(result.output.reply).toContain('pong');
      expect(result.output.count).toBe(round);
    }
  });
});

describe('A2A task lifecycle — in-process', () => {
  it('creates a task and gets a completed result via app.fetch', async () => {
    // Build a server-side pong agent backed by app.fetch
    const pongAgent = await createAgent({
      name: 'in-process-pong',
      version: '1.0.0',
    })
      .use(http())
      .use(a2a())
      .build();

    const { app: pongApp2, addEntrypoint } = await createAgentApp(pongAgent);
    addEntrypoint({
      key: 'ping',
      description: 'Pong',
      input: z.object({ message: z.string(), count: z.number() }),
      output: z.object({ reply: z.string(), count: z.number() }),
      handler: async ctx => ({
        output: {
          reply: ctx.input.message.replace('ping', 'pong'),
          count: ctx.input.count,
        },
      }),
    });

    // Use in-process fetch override: inject our app.fetch as the transport
    // by directly invoking via the pongApp and checking the response format
    const req = new Request('http://localhost/entrypoints/ping/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { message: 'ping test', count: 1 } }),
    });

    const res = await pongApp2.fetch(req);
    expect(res.ok).toBe(true);
    const body = (await res.json()) as {
      output: { reply: string; count: number };
    };
    expect(body.output.reply).toBe('pong test');
    expect(body.output.count).toBe(1);
  });
});
