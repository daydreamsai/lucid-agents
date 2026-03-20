import { waitForTask } from '@lucid-agents/a2a';
import { createAgentApp } from '@lucid-agents/hono';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { createKitchenSinkAgent } from '../agent';
import { createClientAgent } from '../client';
import { registerEntrypoints } from '../entrypoints';

const PORT = 19001;
const CLIENT_PORT = 19002;

let ksServer: ReturnType<typeof Bun.serve>;
let clientServer: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  // Provide minimal env vars so paymentsFromEnv() returns a valid config.
  // The payments extension validates these even for free entrypoints.
  process.env.PAYMENTS_RECEIVABLE_ADDRESS =
    process.env.PAYMENTS_RECEIVABLE_ADDRESS ??
    '0x0000000000000000000000000000000000000001';
  process.env.FACILITATOR_URL =
    process.env.FACILITATOR_URL ?? 'https://facilitator.example.com';
  process.env.NETWORK = process.env.NETWORK ?? 'base-sepolia';

  // Start kitchen-sink agent
  const agent = await createKitchenSinkAgent();
  const { app, addEntrypoint } = await createAgentApp(agent);
  registerEntrypoints(addEntrypoint, agent);
  ksServer = Bun.serve({ port: PORT, fetch: app.fetch.bind(app) });

  // Start client agent
  const clientAgent = await createClientAgent();
  const { app: clientApp } = await createAgentApp(clientAgent);
  clientServer = Bun.serve({
    port: CLIENT_PORT,
    fetch: clientApp.fetch.bind(clientApp),
  });

  // Give servers time to be ready
  await new Promise(resolve => setTimeout(resolve, 150));
});

afterAll(() => {
  ksServer?.stop();
  clientServer?.stop();
});

describe('A2A: client calls kitchen-sink', () => {
  it('kitchen-sink agent card is discoverable', async () => {
    const res = await fetch(
      `http://localhost:${PORT}/.well-known/agent-card.json`
    );
    expect(res.ok).toBe(true);
    const card = (await res.json()) as { name: string; skills: unknown[] };
    expect(card.name).toBe('kitchen-sink-agent');
    expect(Array.isArray(card.skills)).toBe(true);
  });

  it('client calls echo via A2A task and receives correct output', async () => {
    const clientAgent = await createClientAgent();
    const a2aRuntime = clientAgent.a2a;
    expect(a2aRuntime).toBeDefined();

    const card = await a2aRuntime!.fetchCard(`http://localhost:${PORT}`);
    expect(card.name).toBe('kitchen-sink-agent');

    const { taskId } = await a2aRuntime!.client.sendMessage(card, 'echo', {
      text: 'hello from client',
    });

    const task = await waitForTask(a2aRuntime!.client, card, taskId);
    expect(task.status).toBe('completed');
    const output = task.result?.output as
      | { text: string; timestamp: string }
      | undefined;
    expect(output?.text).toBe('hello from client');
    expect(typeof output?.timestamp).toBe('string');
  });

  it('agent card includes AP2 extension', async () => {
    const res = await fetch(
      `http://localhost:${PORT}/.well-known/agent-card.json`
    );
    const card = (await res.json()) as {
      capabilities?: { extensions?: Array<{ uri?: string }> };
    };
    const extensions = card.capabilities?.extensions ?? [];
    const hasAP2 = extensions.some(ext => ext.uri?.includes('ap2'));
    expect(hasAP2).toBe(true);
  });
});
