/**
 * Smoke tests for all example modules.
 *
 * Verifies that every example can build agents and boot servers without
 * external dependencies (no blockchain, no wallets, no real APIs).
 * Each test group recreates the agent construction inline rather than
 * importing the example files (which have top-level await / start servers).
 */
import { a2a, waitForTask } from '@lucid-agents/a2a';
import { analytics, getSummary } from '@lucid-agents/analytics';
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { mpp, tempo } from '@lucid-agents/mpp';
import { payments } from '@lucid-agents/payments';
import type { A2ARuntime } from '@lucid-agents/types/a2a';
import { wallets } from '@lucid-agents/wallet';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** POST to an entrypoint via app.fetch -- no network required */
async function invoke(
  app: { fetch: (req: Request) => Response | Promise<Response> },
  key: string,
  input: Record<string, unknown>
) {
  const req = new Request(`http://localhost/entrypoints/${key}/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });
  return app.fetch(req);
}

/** POST and assert 200, returning parsed JSON body */
async function invokeOk(
  app: { fetch: (req: Request) => Response | Promise<Response> },
  key: string,
  input: Record<string, unknown>
) {
  const res = await invoke(app, key, input);
  if (!res.ok) {
    throw new Error(`invoke ${key} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { output: Record<string, unknown> };
}

/** Fetch agent card from in-process app */
async function fetchCard(app: {
  fetch: (req: Request) => Response | Promise<Response>;
}) {
  const req = new Request('http://localhost/.well-known/agent-card.json');
  const res = await app.fetch(req);
  if (!res.ok) {
    throw new Error(`agent card failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as {
    name: string;
    version: string;
    skills: Array<{ id: string; [k: string]: unknown }>;
    capabilities?: {
      extensions?: Array<{ uri?: string; [k: string]: unknown }>;
    };
    [k: string]: unknown;
  };
}

// ---------------------------------------------------------------------------
// Global env stubs
// ---------------------------------------------------------------------------

describe('Example Smoke Tests', () => {
  beforeAll(() => {
    process.env.PAYMENTS_RECEIVABLE_ADDRESS =
      process.env.PAYMENTS_RECEIVABLE_ADDRESS ??
      '0x0000000000000000000000000000000000000001';
    process.env.FACILITATOR_URL =
      process.env.FACILITATOR_URL ?? 'https://facilitator.example.com';
    process.env.NETWORK = process.env.NETWORK ?? 'base-sepolia';
  });

  // =========================================================================
  // 1. core/full-agent
  // =========================================================================
  describe('core/full-agent', () => {
    let app: { fetch: (req: Request) => Response | Promise<Response> };

    beforeAll(async () => {
      const agent = await createAgent({
        name: 'full-agent-example',
        version: '1.0.0',
        description: 'Smoke test for full-agent example',
      })
        .use(http())
        .use(
          payments({
            config: {
              payTo: '0x0000000000000000000000000000000000000001',
              network: 'eip155:84532',
              facilitatorUrl: 'https://facilitator.example.com',
            },
          })
        )
        .build();

      const agentApp = await createAgentApp(agent);

      agentApp.addEntrypoint({
        key: 'echo',
        description: 'Echo back the input text',
        input: z.object({ text: z.string() }),
        output: z.object({ text: z.string() }),
        handler: async (ctx: { input: { text: string } }) => ({
          output: { text: ctx.input.text },
          usage: { total_tokens: ctx.input.text.length },
        }),
      });

      app = agentApp.app;
    });

    it('agent card is valid JSON', async () => {
      const card = await fetchCard(app);
      expect(card.name).toBe('full-agent-example');
      expect(card.version).toBe('1.0.0');
      expect(Array.isArray(card.skills)).toBe(true);
    });

    it('echo entrypoint returns correct shape', async () => {
      const result = await invokeOk(app, 'echo', { text: 'hello' });
      expect(result.output.text).toBe('hello');
    });
  });

  // =========================================================================
  // 2. payments/paid-service
  // =========================================================================
  describe('payments/paid-service', () => {
    let app: { fetch: (req: Request) => Response | Promise<Response> };

    beforeAll(async () => {
      const agent = await createAgent({
        name: 'paid-service',
        version: '1.0.0',
        description: 'Service agent with paid entrypoints',
      })
        .use(http())
        .use(
          payments({
            config: {
              payTo: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
              network: 'eip155:84532',
              facilitatorUrl: 'https://facilitator.daydreams.systems',
            },
          })
        )
        .build();

      const agentApp = await createAgentApp(agent);

      agentApp.addEntrypoint({
        key: 'echo',
        description: 'Echo back your message',
        price: '1.0',
        input: z.object({ message: z.string() }),
        output: z.object({ message: z.string(), timestamp: z.string() }),
        handler: async (ctx: { input: { message: string } }) => ({
          output: {
            message: ctx.input.message,
            timestamp: new Date().toISOString(),
          },
        }),
      });

      agentApp.addEntrypoint({
        key: 'process',
        description: 'Process an item',
        price: '5.0',
        input: z.object({ item: z.string() }),
        output: z.object({ result: z.string(), processed: z.boolean() }),
        handler: async (ctx: { input: { item: string } }) => ({
          output: {
            result: `Processed: ${ctx.input.item}`,
            processed: true,
          },
        }),
      });

      app = agentApp.app;
    });

    it('agent card has payment info', async () => {
      const card = await fetchCard(app);
      expect(card.name).toBe('paid-service');
      expect(Array.isArray(card.skills)).toBe(true);
    });

    it('echo entrypoint returns 402 without payment header', async () => {
      const res = await invoke(app, 'echo', { message: 'hello' });
      expect(res.status).toBe(402);
    });

    it('process entrypoint returns 402 without payment header', async () => {
      const res = await invoke(app, 'process', { item: 'test' });
      expect(res.status).toBe(402);
    });
  });

  // =========================================================================
  // 3. a2a/full-integration (three-agent composition)
  // =========================================================================
  describe('a2a/full-integration', () => {
    const WORKER_PORT = 19010;
    const FACILITATOR_PORT = 19011;

    let workerServer: ReturnType<typeof Bun.serve>;
    let facilitatorServer: ReturnType<typeof Bun.serve>;
    let clientA2A: A2ARuntime;

    beforeAll(async () => {
      // Agent 1: Worker
      const workerAgent = await createAgent({
        name: 'worker-agent',
        version: '1.0.0',
        description: 'Worker agent that processes tasks',
      })
        .use(http())
        .use(a2a())
        .build();

      const {
        app: workerApp,
        addEntrypoint: addWorkerEp,
        runtime: _workerRuntime,
      } = await createAgentApp(workerAgent);

      addWorkerEp({
        key: 'echo',
        description: 'Echoes back the input text',
        input: z.object({ text: z.string() }),
        output: z.object({ text: z.string() }),
        handler: async (ctx: { input: { text: string } }) => ({
          output: { text: `Echo: ${ctx.input.text}` },
          usage: { total_tokens: ctx.input.text.length },
        }),
      });

      addWorkerEp({
        key: 'process',
        description: 'Processes data and returns result',
        input: z.object({ data: z.array(z.number()) }),
        output: z.object({ result: z.number() }),
        handler: async (ctx: { input: { data: number[] } }) => {
          const result = ctx.input.data.reduce(
            (sum: number, n: number) => sum + n,
            0
          );
          return {
            output: { result },
            usage: { total_tokens: ctx.input.data.length },
          };
        },
      });

      workerServer = Bun.serve({
        port: WORKER_PORT,
        fetch: workerApp.fetch.bind(workerApp),
      });

      // Agent 2: Facilitator
      const facilitatorAgent = await createAgent({
        name: 'facilitator-agent',
        version: '1.0.0',
        description: 'Facilitator agent that proxies to worker',
      })
        .use(http())
        .use(a2a())
        .build();

      const {
        app: facilitatorApp,
        addEntrypoint: addFacilitatorEp,
        runtime: facilitatorRuntime,
      } = await createAgentApp(facilitatorAgent);

      const facilitatorA2A = facilitatorRuntime.a2a!;

      addFacilitatorEp({
        key: 'echo',
        description: 'Proxies echo requests to worker agent',
        input: z.object({ text: z.string() }),
        output: z.object({ text: z.string() }),
        handler: async (ctx: { input: { text: string } }) => {
          const workerCard = await facilitatorA2A.fetchCard(
            `http://localhost:${WORKER_PORT}`
          );
          const { taskId } = await facilitatorA2A.client.sendMessage(
            workerCard,
            'echo',
            { text: ctx.input.text }
          );
          const task = await waitForTask<{ text: string }>(
            facilitatorA2A.client,
            workerCard,
            taskId
          );
          if (task.status === 'failed') {
            throw new Error(
              `Task failed: ${task.error?.message || 'Unknown error'}`
            );
          }
          return {
            output: task.result!.output!,
            usage: task.result?.usage,
          };
        },
      });

      facilitatorServer = Bun.serve({
        port: FACILITATOR_PORT,
        fetch: facilitatorApp.fetch.bind(facilitatorApp),
      });

      // Agent 3: Client (no server needed)
      const clientAgent = await createAgent({
        name: 'client-agent',
        version: '1.0.0',
        description: 'Client agent that calls facilitator',
      })
        .use(a2a())
        .build();

      clientA2A = clientAgent.a2a!;

      // Give servers time to be ready
      await new Promise(resolve => setTimeout(resolve, 150));
    });

    afterAll(() => {
      workerServer?.stop();
      facilitatorServer?.stop();
    });

    it('worker agent card is discoverable', async () => {
      const res = await fetch(
        `http://localhost:${WORKER_PORT}/.well-known/agent-card.json`
      );
      expect(res.ok).toBe(true);
      const card = (await res.json()) as { name: string; skills: unknown[] };
      expect(card.name).toBe('worker-agent');
      expect(Array.isArray(card.skills)).toBe(true);
    });

    it('facilitator agent card is discoverable', async () => {
      const res = await fetch(
        `http://localhost:${FACILITATOR_PORT}/.well-known/agent-card.json`
      );
      expect(res.ok).toBe(true);
      const card = (await res.json()) as { name: string; skills: unknown[] };
      expect(card.name).toBe('facilitator-agent');
      expect(Array.isArray(card.skills)).toBe(true);
    });

    it('client calls worker via facilitator (echo)', async () => {
      const facilitatorCard = await clientA2A.fetchCard(
        `http://localhost:${FACILITATOR_PORT}`
      );
      expect(facilitatorCard.name).toBe('facilitator-agent');

      const { taskId } = await clientA2A.client.sendMessage(
        facilitatorCard,
        'echo',
        { text: 'hello from client' }
      );

      const task = await waitForTask(clientA2A.client, facilitatorCard, taskId);
      expect(task.status).toBe('completed');
      const output = task.result?.output as { text: string } | undefined;
      expect(output?.text).toBe('Echo: hello from client');
    });
  });

  // =========================================================================
  // 4. analytics
  // =========================================================================
  describe('analytics', () => {
    let app: { fetch: (req: Request) => Response | Promise<Response> };

    beforeAll(async () => {
      const agent = await createAgent({
        name: 'analytics-agent',
        version: '1.0.0',
        description: 'Agent demonstrating payment analytics',
      })
        .use(http())
        .use(
          payments({
            config: {
              payTo: '0x0000000000000000000000000000000000000001',
              network: 'eip155:84532',
              facilitatorUrl: 'https://facilitator.example.com',
            },
          })
        )
        .use(analytics())
        .build();

      const agentApp = await createAgentApp(agent);

      agentApp.addEntrypoint({
        key: 'summary',
        description: 'Get payment summary statistics',
        input: z.object({
          windowHours: z.number().optional().default(24),
        }),
        output: z.object({
          summary: z.object({
            outgoingTotal: z.string(),
            incomingTotal: z.string(),
            netTotal: z.string(),
            outgoingCount: z.number(),
            incomingCount: z.number(),
          }),
        }),
        async handler({
          input,
          runtime,
        }: {
          input: { windowHours: number };
          runtime: { analytics?: { paymentTracker?: unknown } };
        }) {
          if (!runtime?.analytics?.paymentTracker) {
            return {
              output: {
                summary: {
                  outgoingTotal: '0',
                  incomingTotal: '0',
                  netTotal: '0',
                  outgoingCount: 0,
                  incomingCount: 0,
                },
              },
            };
          }

          const windowMs = input.windowHours * 60 * 60 * 1000;
          const summary = await getSummary(
            runtime.analytics.paymentTracker as Parameters<
              typeof getSummary
            >[0],
            windowMs
          );

          return {
            output: {
              summary: {
                outgoingTotal: summary.outgoingTotal.toString(),
                incomingTotal: summary.incomingTotal.toString(),
                netTotal: summary.netTotal.toString(),
                outgoingCount: summary.outgoingCount,
                incomingCount: summary.incomingCount,
              },
            },
          };
        },
      });

      app = agentApp.app;
    });

    it('agent card is valid', async () => {
      const card = await fetchCard(app);
      expect(card.name).toBe('analytics-agent');
    });

    it('summary entrypoint returns expected fields', async () => {
      const result = await invokeOk(app, 'summary', {});
      const summary = result.output.summary as Record<string, unknown>;
      expect(typeof summary.outgoingTotal).toBe('string');
      expect(typeof summary.incomingTotal).toBe('string');
      expect(typeof summary.netTotal).toBe('string');
      expect(typeof summary.outgoingCount).toBe('number');
      expect(typeof summary.incomingCount).toBe('number');
    });
  });

  // =========================================================================
  // 5. mpp/mpp-paid-service
  // =========================================================================
  describe('mpp/mpp-paid-service', () => {
    let app: { fetch: (req: Request) => Response | Promise<Response> };

    beforeAll(async () => {
      const agent = await createAgent({
        name: 'mpp-paid-service',
        version: '1.0.0',
        description: 'Paid service agent using MPP',
      })
        .use(http())
        .use(
          mpp({
            config: {
              methods: [
                tempo.server({
                  currency: '0x20c0000000000000000000000000000000000000',
                  recipient: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
                }),
              ],
              currency: 'usd',
              defaultIntent: 'charge',
            },
          })
        )
        .build();

      const agentApp = await createAgentApp(agent);

      agentApp.addEntrypoint({
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

      agentApp.addEntrypoint({
        key: 'summarize',
        description: 'Summarize text (paid)',
        price: '0.01',
        input: z.object({ text: z.string() }),
        output: z.object({
          wordCount: z.number(),
          charCount: z.number(),
          preview: z.string(),
        }),
        handler: async ({ input }: { input: { text: string } }) => {
          const words = input.text.trim().split(/\s+/).filter(Boolean);
          const preview =
            input.text.length > 100
              ? `${input.text.slice(0, 100)}...`
              : input.text;
          return {
            output: {
              wordCount: words.length,
              charCount: input.text.length,
              preview,
            },
          };
        },
      });

      app = agentApp.app;
    });

    it('agent card is valid', async () => {
      const card = await fetchCard(app);
      expect(card.name).toBe('mpp-paid-service');
    });

    it('free health entrypoint returns correct shape', async () => {
      const result = await invokeOk(app, 'health', {});
      expect(result.output.status).toBe('ok');
      expect(typeof result.output.timestamp).toBe('string');
    });

    it('paid summarize entrypoint returns 402 without payment', async () => {
      const res = await invoke(app, 'summarize', { text: 'hello world' });
      expect(res.status).toBe(402);
    });
  });

  // =========================================================================
  // 6. payments/policy-agent
  // =========================================================================
  describe('payments/policy-agent', () => {
    it('builds without error and produces valid agent card', async () => {
      const agent = await createAgent({
        name: 'policy-agent',
        version: '1.0.0',
        description: 'Agent demonstrating payment policy enforcement',
      })
        .use(http())
        .use(
          payments({
            config: {
              payTo: '0x1234567890123456789012345678901234567890',
              network: 'eip155:84532',
              facilitatorUrl: 'https://facilitator.daydreams.systems',
            },
          })
        )
        .use(
          wallets({
            config: {
              agent: {
                type: 'local',
                privateKey:
                  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
              },
            },
          })
        )
        .build();

      expect(agent).toBeDefined();
      expect(agent.payments).toBeDefined();
      expect(agent.wallets).toBeDefined();

      const agentApp = await createAgentApp(agent);
      const card = await fetchCard(agentApp.app);
      expect(card.name).toBe('policy-agent');
      expect(card.version).toBe('1.0.0');
    });
  });

  // =========================================================================
  // supplier-reliability-agent
  // =========================================================================
  describe('supplier-reliability-agent', () => {
    let app: { fetch: (req: Request) => Response | Promise<Response> };

    beforeAll(async () => {
      const { createSupplierReliabilityAgent } = await import('../supplier-reliability-agent/agent');
      const { registerEntrypoints } = await import('../supplier-reliability-agent/entrypoints');
      const { createAgentApp } = await import('@lucid-agents/hono');
      
      const agent = await createSupplierReliabilityAgent();
      const instance = await createAgentApp(agent);
      registerEntrypoints(instance.addEntrypoint);
      app = instance.app;
    });

    it('returns a valid agent card', async () => {
      const res = await app.fetch(new Request('http://localhost/.well-known/agent-card.json'));
      expect(res.status).toBe(200);
      const card = await res.json() as any;
      expect(card.name).toBe('supplier-reliability-agent');
    });

    it('requires payment for score endpoint', async () => {
      const res = await app.fetch(
        new Request('http://localhost/entrypoints/score/invoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: { supplierId: 'acme-corp' } }),
        })
      );
      expect(res.status).toBe(402);
      const json = await res.json() as any;
      expect(json.code).toBe('payment_required');
    });
  });
});
