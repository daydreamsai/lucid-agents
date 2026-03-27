/**
 * A2A Ping-Pong Example
 *
 * Demonstrates two agents exchanging A2A messages in a ping-pong pattern.
 *
 * Architecture:
 * - Ping Agent: Sends "ping" messages and waits for "pong" replies
 * - Pong Agent: Receives "ping" and replies with "pong"
 *
 * Flow: Ping Agent -> Pong Agent -> Ping Agent (reply)
 *
 * Run with: bun run packages/examples/src/a2a/a2a-ping-pong.ts
 */

import { a2a, waitForTask } from '@lucid-agents/a2a';
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import type { A2ARuntime } from '@lucid-agents/types/a2a';
import { z } from 'zod';

const PONG_PORT = 9001;
const PONG_URL = `http://localhost:${PONG_PORT}`;

// ── Helper: start a minimal Bun HTTP server ──────────────────────────────────
async function startServer(
  port: number,
  handler: (req: Request) => Response | Promise<Response>
): Promise<{ url: string; close: () => void }> {
  if (typeof Bun !== 'undefined') {
    const server = Bun.serve({ port, fetch: handler });
    return { url: `http://localhost:${port}`, close: () => server.stop() };
  }
  throw new Error('Bun runtime required');
}

// ── Pong Agent ───────────────────────────────────────────────────────────────
async function createPongAgent() {
  const agent = await createAgent({
    name: 'pong-agent',
    version: '1.0.0',
    description: 'Listens for ping messages and replies with pong',
  })
    .use(http())
    .use(a2a())
    .build();

  const { app, addEntrypoint } = await createAgentApp(agent);

  addEntrypoint({
    key: 'ping',
    description: 'Receive a ping and reply with pong',
    input: z.object({ message: z.string(), count: z.number() }),
    output: z.object({ reply: z.string(), count: z.number() }),
    handler: async ctx => {
      const { message, count } = ctx.input;
      console.log(`[Pong] Received: "${message}" (round ${count})`);
      return {
        output: {
          reply: message.replace('ping', 'pong'),
          count,
        },
      };
    },
  });

  return { app, agent };
}

// ── Ping Agent ───────────────────────────────────────────────────────────────
async function createPingAgent() {
  const agent = await createAgent({
    name: 'ping-agent',
    version: '1.0.0',
    description: 'Sends ping messages and waits for pong replies',
  })
    .use(a2a())
    .build();

  const a2aRuntime = agent.a2a as A2ARuntime | undefined;
  if (!a2aRuntime) throw new Error('A2A runtime not available');

  return { agent, a2a: a2aRuntime };
}

// ── Main ─────────────────────────────────────────────────────────────────────
export async function runPingPong(rounds = 3) {
  console.log('='.repeat(60));
  console.log('A2A Ping-Pong Example');
  console.log('='.repeat(60));

  // Start pong agent server
  const { app: pongApp } = await createPongAgent();
  const pongServer = await startServer(PONG_PORT, pongApp.fetch.bind(pongApp));
  console.log(`Pong agent running at ${pongServer.url}\n`);

  // Create ping agent (client only — no HTTP server needed)
  const { a2a: pingA2A } = await createPingAgent();

  // Discover pong agent card
  const pongCard = await pingA2A.fetchCard(PONG_URL);
  console.log(`Discovered pong agent: ${pongCard.name}\n`);

  const results: Array<{ round: number; reply: string }> = [];

  try {
    for (let round = 1; round <= rounds; round++) {
      console.log(`Round ${round}/${rounds}: Sending ping...`);

      const { taskId } = await pingA2A.client.sendMessage(pongCard, 'ping', {
        message: `ping #${round}`,
        count: round,
      });

      const task = await waitForTask<{ reply: string; count: number }>(
        pingA2A.client,
        pongCard,
        taskId
      );

      if (task.status === 'failed') {
        throw new Error(`Task failed: ${task.error?.message}`);
      }

      const reply = task.result?.output?.reply ?? '';
      console.log(`  -> Got: "${reply}"`);
      results.push({ round, reply });
    }

    console.log('\nPing-pong complete!');
    console.log(`Exchanged ${rounds} round(s) successfully.`);
  } finally {
    pongServer.close();
  }

  return results;
}

// Run when executed directly
if (
  typeof process !== 'undefined' &&
  process.argv[1]?.includes('a2a-ping-pong')
) {
  runPingPong(3).catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}
