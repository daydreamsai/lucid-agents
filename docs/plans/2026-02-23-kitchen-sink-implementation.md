# Kitchen-Sink Example Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `packages/examples/src/kitchen-sink/` — a persistent Hono server demonstrating all major Lucid Agents SDK capabilities, with a second client agent that calls it via A2A.

**Architecture:** Modular split across `agent.ts` (factory), `entrypoints.ts` (handlers), `client.ts` (A2A client), and `index.ts` (startup). Tests are written first per TDD; each task ends with a commit.

**Tech Stack:** `bun:test`, `@lucid-agents/core`, `@lucid-agents/hono`, `@lucid-agents/a2a`, `@lucid-agents/analytics`, `@lucid-agents/ap2`, `@lucid-agents/scheduler`, `@lucid-agents/identity`, `@lucid-agents/payments`, `@lucid-agents/wallet`, `zod`

---

## Reference

- Design doc: `docs/plans/2026-02-23-kitchen-sink-design.md`
- Existing full-agent example: `packages/examples/src/core/full-agent.ts`
- Existing A2A example: `packages/examples/src/a2a/full-integration.ts`
- Analytics example: `packages/examples/src/analytics/index.ts`
- Scheduler example: `packages/examples/src/scheduler/hello-interval.ts`
- Run tests: `bun test packages/examples/src/kitchen-sink/__tests__`
- Type-check: `cd packages/examples && bun run type-check`
- Lint: `cd packages/examples && bun run lint`

---

## Task 1: Agent factory (`agent.ts`)

**Files:**
- Create: `packages/examples/src/kitchen-sink/__tests__/agent.test.ts`
- Create: `packages/examples/src/kitchen-sink/agent.ts`

### Step 1: Write the failing test

Create `packages/examples/src/kitchen-sink/__tests__/agent.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test';
import { createKitchenSinkAgent } from '../agent';

describe('createKitchenSinkAgent', () => {
  it('builds the agent with all required extensions', async () => {
    const agent = await createKitchenSinkAgent();

    expect(agent.a2a).toBeDefined();
    expect(agent.analytics).toBeDefined();
    expect(agent.scheduler).toBeDefined();
    expect(agent.ap2).toBeDefined();
  });

  it('does not include wallet/payments/identity when env vars are absent', async () => {
    // Ensure env vars are unset
    const saved = {
      type: process.env.AGENT_WALLET_TYPE,
      key: process.env.AGENT_WALLET_PRIVATE_KEY,
    };
    delete process.env.AGENT_WALLET_TYPE;
    delete process.env.AGENT_WALLET_PRIVATE_KEY;

    const agent = await createKitchenSinkAgent();
    expect(agent.wallets).toBeUndefined();
    expect(agent.identity).toBeUndefined();

    // Restore
    if (saved.type) process.env.AGENT_WALLET_TYPE = saved.type;
    if (saved.key) process.env.AGENT_WALLET_PRIVATE_KEY = saved.key;
  });
});
```

### Step 2: Run test to verify it fails

```bash
bun test packages/examples/src/kitchen-sink/__tests__/agent.test.ts
```

Expected: FAIL — `Cannot find module '../agent'`

### Step 3: Implement `agent.ts`

Create `packages/examples/src/kitchen-sink/agent.ts`:

```typescript
import { a2a } from '@lucid-agents/a2a';
import { analytics } from '@lucid-agents/analytics';
import { ap2 } from '@lucid-agents/ap2';
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { identity } from '@lucid-agents/identity';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { scheduler } from '@lucid-agents/scheduler';
import { wallets, walletsFromEnv } from '@lucid-agents/wallet';

export async function createKitchenSinkAgent() {
  let builder = createAgent({
    name: 'kitchen-sink-agent',
    version: '1.0.0',
    description: 'Demonstrates all major Lucid Agents SDK capabilities',
  })
    .use(http())
    .use(a2a())
    .use(analytics())
    .use(scheduler())
    .use(ap2({ roles: ['assistant'] }));

  const walletsConfig = walletsFromEnv();
  if (walletsConfig) {
    builder = builder.use(wallets({ config: walletsConfig }));
    builder = builder.use(payments({ config: paymentsFromEnv() }));
    builder = builder.use(
      identity({
        config: {
          domain: process.env.AGENT_DOMAIN,
          autoRegister: process.env.AUTO_REGISTER === 'true',
        },
      })
    );
  }

  return builder.build();
}
```

### Step 4: Run test to verify it passes

```bash
bun test packages/examples/src/kitchen-sink/__tests__/agent.test.ts
```

Expected: PASS — 2 tests pass

### Step 5: Commit

```bash
git add packages/examples/src/kitchen-sink/agent.ts \
        packages/examples/src/kitchen-sink/__tests__/agent.test.ts
git commit -m "feat(kitchen-sink): add agent factory with all extensions"
```

---

## Task 2: Entrypoints (`entrypoints.ts`)

**Files:**
- Create: `packages/examples/src/kitchen-sink/__tests__/entrypoints.test.ts`
- Create: `packages/examples/src/kitchen-sink/entrypoints.ts`

### Step 1: Write the failing test

Create `packages/examples/src/kitchen-sink/__tests__/entrypoints.test.ts`:

```typescript
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { a2a } from '@lucid-agents/a2a';
import { analytics } from '@lucid-agents/analytics';
import { scheduler } from '@lucid-agents/scheduler';
import { createAgentApp } from '@lucid-agents/hono';
import { describe, expect, it, beforeAll } from 'bun:test';
import { registerEntrypoints } from '../entrypoints';

// Helper: POST to an entrypoint via app.fetch (no network required)
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
  const res = await app.fetch(req);
  return res.json() as Promise<{ output: Record<string, unknown> }>;
}

let app: { fetch: (req: Request) => Response | Promise<Response> };

beforeAll(async () => {
  const agent = await createAgent({
    name: 'test-kitchen-sink',
    version: '1.0.0',
    description: 'test',
  })
    .use(http())
    .use(a2a())
    .use(analytics())
    .use(scheduler())
    .build();

  const agentApp = await createAgentApp(agent);
  registerEntrypoints(agentApp.addEntrypoint, agent);
  app = agentApp.app;
});

describe('echo entrypoint', () => {
  it('returns text and timestamp', async () => {
    const result = await invoke(app, 'echo', { text: 'hello' });
    expect(result.output.text).toBe('hello');
    expect(typeof result.output.timestamp).toBe('string');
  });
});

describe('summarize entrypoint', () => {
  it('returns word count, char count, and preview', async () => {
    const result = await invoke(app, 'summarize', {
      text: 'The quick brown fox jumps over the lazy dog',
    });
    expect(result.output.wordCount).toBe(9);
    expect(result.output.charCount).toBe(43);
    expect(typeof result.output.preview).toBe('string');
  });
});

describe('analytics-report entrypoint', () => {
  it('returns payment summary fields', async () => {
    const result = await invoke(app, 'analytics-report', {});
    const { output } = result;
    expect(typeof output.outgoingTotal).toBe('string');
    expect(typeof output.incomingTotal).toBe('string');
    expect(typeof output.netTotal).toBe('string');
    expect(typeof output.transactionCount).toBe('number');
  });
});

describe('scheduler-status entrypoint', () => {
  it('returns a jobs array', async () => {
    const result = await invoke(app, 'scheduler-status', {});
    expect(Array.isArray(result.output.jobs)).toBe(true);
  });
});
```

### Step 2: Run test to verify it fails

```bash
bun test packages/examples/src/kitchen-sink/__tests__/entrypoints.test.ts
```

Expected: FAIL — `Cannot find module '../entrypoints'`

### Step 3: Implement `entrypoints.ts`

Create `packages/examples/src/kitchen-sink/entrypoints.ts`:

```typescript
import {
  getAllTransactions,
  getSummary,
} from '@lucid-agents/analytics';
import { createSchedulerWorker } from '@lucid-agents/scheduler';
import type { AgentRuntime } from '@lucid-agents/types/core';
import { z } from 'zod';

type AddEntrypoint = (def: {
  key: string;
  description: string;
  input: z.ZodTypeAny;
  output?: z.ZodTypeAny;
  price?: string;
  streaming?: boolean;
  handler?: (ctx: { input: Record<string, unknown>; runtime: AgentRuntime }) => Promise<{ output: unknown; usage?: unknown }>;
  stream?: (ctx: { input: Record<string, unknown>; runtime: AgentRuntime }, emit: (chunk: unknown) => Promise<void>) => Promise<{ output: unknown; usage?: unknown }>;
}) => void;

export function registerEntrypoints(
  addEntrypoint: AddEntrypoint,
  _runtime: AgentRuntime
) {
  // ── echo ─────────────────────────────────────────────────────────────────
  // Free entrypoint. Demonstrates basic HTTP handler.
  addEntrypoint({
    key: 'echo',
    description: 'Echo back the input text with a timestamp',
    input: z.object({ text: z.string() }),
    output: z.object({ text: z.string(), timestamp: z.string() }),
    handler: async ctx => {
      const { text } = ctx.input as { text: string };
      return {
        output: { text, timestamp: new Date().toISOString() },
        usage: { total_tokens: text.length },
      };
    },
  });

  // ── summarize ─────────────────────────────────────────────────────────────
  // Paid entrypoint (0.001 USDC). Demonstrates x402 payments.
  addEntrypoint({
    key: 'summarize',
    description: 'Summarize text — returns word count, char count, and preview',
    input: z.object({ text: z.string() }),
    output: z.object({
      wordCount: z.number(),
      charCount: z.number(),
      preview: z.string(),
    }),
    price: '1000', // 0.001 USDC (6 decimals)
    handler: async ctx => {
      const { text } = ctx.input as { text: string };
      const words = text.trim().split(/\s+/).filter(Boolean);
      return {
        output: {
          wordCount: words.length,
          charCount: text.length,
          preview: text.slice(0, 100),
        },
        usage: { total_tokens: words.length },
      };
    },
  });

  // ── stream ────────────────────────────────────────────────────────────────
  // Streaming entrypoint. Demonstrates emit-based streaming.
  addEntrypoint({
    key: 'stream',
    description: 'Stream the prompt back one character at a time',
    input: z.object({ prompt: z.string() }),
    streaming: true,
    stream: async (ctx, emit) => {
      const { prompt } = ctx.input as { prompt: string };
      for (const char of prompt) {
        await emit({ kind: 'delta', delta: char, mime: 'text/plain' });
      }
      await emit({
        kind: 'text',
        text: `\nStreamed: ${prompt}`,
        mime: 'text/plain',
      });
      return {
        output: { done: true },
        usage: { total_tokens: prompt.length },
      };
    },
  });

  // ── analytics-report ──────────────────────────────────────────────────────
  // Queries the analytics extension. Demonstrates runtime.analytics usage.
  addEntrypoint({
    key: 'analytics-report',
    description: 'Get payment summary for a time window',
    input: z.object({ windowHours: z.number().optional().default(24) }),
    output: z.object({
      outgoingTotal: z.string(),
      incomingTotal: z.string(),
      netTotal: z.string(),
      transactionCount: z.number(),
    }),
    handler: async ctx => {
      const { windowHours } = ctx.input as { windowHours: number };
      const runtime = ctx.runtime as AgentRuntime & {
        analytics?: { paymentTracker: unknown };
      };

      if (!runtime?.analytics?.paymentTracker) {
        return {
          output: {
            outgoingTotal: '0',
            incomingTotal: '0',
            netTotal: '0',
            transactionCount: 0,
          },
        };
      }

      const windowMs = windowHours * 60 * 60 * 1000;
      const summary = await getSummary(
        runtime.analytics.paymentTracker as Parameters<typeof getSummary>[0],
        windowMs
      );
      const txns = await getAllTransactions(
        runtime.analytics.paymentTracker as Parameters<typeof getAllTransactions>[0],
        windowMs
      );

      return {
        output: {
          outgoingTotal: summary.outgoingTotal.toString(),
          incomingTotal: summary.incomingTotal.toString(),
          netTotal: summary.netTotal.toString(),
          transactionCount: txns.length,
        },
      };
    },
  });

  // ── scheduler-status ──────────────────────────────────────────────────────
  // Reads scheduler state. Demonstrates runtime.scheduler usage.
  addEntrypoint({
    key: 'scheduler-status',
    description: 'List active scheduled jobs',
    input: z.object({}),
    output: z.object({
      jobs: z.array(
        z.object({
          id: z.string(),
          schedule: z.string(),
          lastRun: z.string().nullable(),
          nextRun: z.string().nullable(),
        })
      ),
    }),
    handler: async ctx => {
      const runtime = ctx.runtime as AgentRuntime & {
        scheduler?: { store: { getHires: () => Promise<Array<{ id: string; jobs: Array<{ id: string; schedule: { kind: string }; lastRunAt?: number; nextRunAt?: number }> }>> } };
      };

      if (!runtime?.scheduler?.store) {
        return { output: { jobs: [] } };
      }

      const hires = await runtime.scheduler.store.getHires();
      const jobs = hires.flatMap(hire =>
        hire.jobs.map(job => ({
          id: job.id,
          schedule: JSON.stringify(job.schedule),
          lastRun: job.lastRunAt ? new Date(job.lastRunAt).toISOString() : null,
          nextRun: job.nextRunAt
            ? new Date(job.nextRunAt).toISOString()
            : null,
        }))
      );

      return { output: { jobs } };
    },
  });
}
```

### Step 4: Run test to verify it passes

```bash
bun test packages/examples/src/kitchen-sink/__tests__/entrypoints.test.ts
```

Expected: PASS — 4 test suites, all pass

### Step 5: Commit

```bash
git add packages/examples/src/kitchen-sink/entrypoints.ts \
        packages/examples/src/kitchen-sink/__tests__/entrypoints.test.ts
git commit -m "feat(kitchen-sink): add entrypoints (echo, summarize, stream, analytics, scheduler)"
```

---

## Task 3: Client agent and A2A integration (`client.ts`)

**Files:**
- Create: `packages/examples/src/kitchen-sink/__tests__/a2a.test.ts`
- Create: `packages/examples/src/kitchen-sink/client.ts`

### Step 1: Write the failing test

Create `packages/examples/src/kitchen-sink/__tests__/a2a.test.ts`:

```typescript
import { waitForTask } from '@lucid-agents/a2a';
import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { createKitchenSinkAgent } from '../agent';
import { registerEntrypoints } from '../entrypoints';
import { createClientAgent } from '../client';
import { createAgentApp } from '@lucid-agents/hono';
import type { A2ARuntime } from '@lucid-agents/types/a2a';

let server: { stop: () => void };
let clientServer: { stop: () => void };
const PORT = 19001;
const CLIENT_PORT = 19002;

beforeAll(async () => {
  // Start kitchen-sink agent
  const agent = await createKitchenSinkAgent();
  const { app, addEntrypoint } = await createAgentApp(agent);
  registerEntrypoints(addEntrypoint, agent);
  server = Bun.serve({ port: PORT, fetch: app.fetch.bind(app) });

  // Start client agent
  const clientAgent = await createClientAgent();
  const clientAgentApp = await createAgentApp(clientAgent);
  clientServer = Bun.serve({
    port: CLIENT_PORT,
    fetch: clientAgentApp.app.fetch.bind(clientAgentApp.app),
  });

  // Give servers time to boot
  await new Promise(resolve => setTimeout(resolve, 100));
});

afterAll(() => {
  server?.stop();
  clientServer?.stop();
});

describe('A2A: client calls kitchen-sink', () => {
  it('discovers the kitchen-sink agent card', async () => {
    const res = await fetch(
      `http://localhost:${PORT}/.well-known/agent-card.json`
    );
    expect(res.ok).toBe(true);
    const card = await res.json();
    expect(card.name).toBe('kitchen-sink-agent');
    expect(Array.isArray(card.skills)).toBe(true);
  });

  it('calls echo via A2A task and receives the correct output', async () => {
    const clientAgent = await createClientAgent();
    const a2aRuntime = clientAgent.a2a as A2ARuntime | undefined;
    expect(a2aRuntime).toBeDefined();

    const kitchenSinkUrl = `http://localhost:${PORT}`;
    const card = await a2aRuntime!.fetchCard(kitchenSinkUrl);
    expect(card.name).toBe('kitchen-sink-agent');

    const { taskId } = await a2aRuntime!.client.sendMessage(card, 'echo', {
      text: 'hello from client',
    });

    const task = await waitForTask<{ text: string; timestamp: string }>(
      a2aRuntime!.client,
      card,
      taskId
    );

    expect(task.status).toBe('completed');
    expect(task.result?.output?.text).toBe('hello from client');
    expect(typeof task.result?.output?.timestamp).toBe('string');
  });

  it('agent card includes A2A and AP2 capabilities', async () => {
    const res = await fetch(
      `http://localhost:${PORT}/.well-known/agent-card.json`
    );
    const card = await res.json();
    // AP2 extension should be in capabilities.extensions
    const extensions = card.capabilities?.extensions ?? [];
    const hasAP2 = extensions.some(
      (ext: { uri?: string }) => ext.uri?.includes('ap2')
    );
    expect(hasAP2).toBe(true);
  });
});
```

### Step 2: Run test to verify it fails

```bash
bun test packages/examples/src/kitchen-sink/__tests__/a2a.test.ts
```

Expected: FAIL — `Cannot find module '../client'`

### Step 3: Implement `client.ts`

Create `packages/examples/src/kitchen-sink/client.ts`:

```typescript
import { a2a, fetchAgentCard, findSkill, waitForTask } from '@lucid-agents/a2a';
import { createAgent } from '@lucid-agents/core';

export async function createClientAgent() {
  return createAgent({
    name: 'kitchen-sink-client',
    version: '1.0.0',
    description: 'Client agent that demonstrates A2A calls to the kitchen-sink',
  })
    .use(a2a())
    .build();
}

/**
 * Run a one-shot A2A demo: discover the kitchen-sink agent, call its echo
 * entrypoint, and print the result.
 */
export async function runA2ADemo(kitchenSinkUrl: string) {
  const agent = await createClientAgent();
  const a2aRuntime = agent.a2a;
  if (!a2aRuntime) throw new Error('A2A runtime not available');

  console.log('[client] Fetching kitchen-sink agent card...');
  const card = await fetchAgentCard(kitchenSinkUrl);
  console.log(`[client] Found agent: ${card.name} (${card.version})`);

  // Show what capabilities the kitchen-sink advertises
  const echoSkill = findSkill(card, 'echo');
  if (!echoSkill) throw new Error('echo skill not found on kitchen-sink agent');
  console.log(`[client] Discovered skill: ${echoSkill.id}`);

  console.log('[client] Calling echo via A2A...');
  const { taskId } = await a2aRuntime.client.sendMessage(card, 'echo', {
    text: 'Hello from the client agent!',
  });

  const task = await waitForTask<{ text: string; timestamp: string }>(
    a2aRuntime.client,
    card,
    taskId
  );

  if (task.status === 'failed') {
    throw new Error(`A2A task failed: ${task.error?.message ?? 'unknown'}`);
  }

  console.log(`[client] Result: ${JSON.stringify(task.result?.output)}`);
  return task.result?.output;
}
```

### Step 4: Run test to verify it passes

```bash
bun test packages/examples/src/kitchen-sink/__tests__/a2a.test.ts
```

Expected: PASS — 3 tests pass

### Step 5: Commit

```bash
git add packages/examples/src/kitchen-sink/client.ts \
        packages/examples/src/kitchen-sink/__tests__/a2a.test.ts
git commit -m "feat(kitchen-sink): add client agent and A2A integration tests"
```

---

## Task 4: Startup entrypoint (`index.ts`)

**Files:**
- Create: `packages/examples/src/kitchen-sink/index.ts`

No test needed — this is a startup script. Verify by running it.

### Step 1: Implement `index.ts`

Create `packages/examples/src/kitchen-sink/index.ts`:

```typescript
/**
 * Kitchen-Sink Example — Lucid Agents SDK
 *
 * Demonstrates: identity · payments · A2A · AP2 · wallet · scheduler · analytics · Hono HTTP
 *
 * Run: bun run packages/examples/src/kitchen-sink/index.ts
 *
 * Environment variables (all optional — agent starts without them):
 *   AGENT_WALLET_TYPE=local            Wallet type (local | thirdweb | lucid)
 *   AGENT_WALLET_PRIVATE_KEY=0x...     Private key for identity + payments
 *   AGENT_DOMAIN=my-agent.example.com  ERC-8004 domain
 *   AUTO_REGISTER=true                 Auto-register identity on startup
 *   FACILITATOR_URL=...                x402 facilitator (default: daydreams.systems)
 *   PAYMENTS_RECEIVABLE_ADDRESS=0x...  Address to receive payments
 *   NETWORK=base-sepolia               Chain network identifier
 *   PORT=8787                          Kitchen-sink server port
 *   CLIENT_PORT=8788                   Client agent port
 */

import { createAgentApp } from '@lucid-agents/hono';
import { createKitchenSinkAgent } from './agent';
import { createClientAgent, runA2ADemo } from './client';
import { registerEntrypoints } from './entrypoints';

const PORT = Number(process.env.PORT ?? 8787);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 8788);
const ORIGIN = `http://localhost:${PORT}`;

async function main() {
  // ── 1. Kitchen-sink agent ──────────────────────────────────────────────────
  const agent = await createKitchenSinkAgent();
  const { app, addEntrypoint } = await createAgentApp(agent);
  registerEntrypoints(addEntrypoint, agent);

  const server = Bun.serve({ port: PORT, fetch: app.fetch.bind(app) });

  // ── 2. Print startup banner ───────────────────────────────────────────────
  const line = '─'.repeat(52);
  console.log(`[kitchen-sink] ${line}`);
  console.log(`[kitchen-sink] Wallet:    ${agent.wallets ? 'configured' : 'not configured (set AGENT_WALLET_TYPE + AGENT_WALLET_PRIVATE_KEY)'}`);
  console.log(`[kitchen-sink] Identity:  ${agent.identity ? 'enabled' : 'disabled (no wallet)'}`);
  console.log(`[kitchen-sink] Payments:  ${agent.payments ? 'x402 enabled' : 'disabled (no wallet)'}`);
  console.log(`[kitchen-sink] Analytics: ready`);
  console.log(`[kitchen-sink] Scheduler: ready`);
  console.log(`[kitchen-sink] A2A:       ready`);
  console.log(`[kitchen-sink] AP2:       roles: assistant`);
  console.log(`[kitchen-sink] Server:    ${ORIGIN}`);
  console.log(`[kitchen-sink] ${line}`);
  console.log(`[kitchen-sink] Try it:`);
  console.log(`[kitchen-sink]   curl ${ORIGIN}/entrypoints/echo/invoke \\`);
  console.log(`[kitchen-sink]        -d '{"input":{"text":"hello"}}'`);
  console.log(`[kitchen-sink]   curl ${ORIGIN}/.well-known/agent-card.json`);
  console.log(`[kitchen-sink] ${line}`);

  // ── 3. Client agent ───────────────────────────────────────────────────────
  const clientAgent = await createClientAgent();
  const clientApp = await createAgentApp(clientAgent);
  Bun.serve({ port: CLIENT_PORT, fetch: clientApp.app.fetch.bind(clientApp.app) });
  console.log(`[client]       Server:    http://localhost:${CLIENT_PORT}`);

  // Give the server a moment to be ready before the demo call
  await new Promise(resolve => setTimeout(resolve, 200));

  // ── 4. A2A demo call ──────────────────────────────────────────────────────
  try {
    await runA2ADemo(ORIGIN);
  } catch (err) {
    console.warn('[client]       A2A demo failed:', err instanceof Error ? err.message : err);
  }

  console.log(`[kitchen-sink] ${line}`);
  console.log(`[kitchen-sink] All capabilities running. Press Ctrl+C to stop.`);

  process.on('SIGINT', () => {
    server.stop();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[kitchen-sink] Fatal:', err);
  process.exit(1);
});
```

### Step 2: Run it to verify

```bash
bun run packages/examples/src/kitchen-sink/index.ts
```

Expected: Banner prints, A2A demo runs, server stays alive.

### Step 3: Commit

```bash
git add packages/examples/src/kitchen-sink/index.ts
git commit -m "feat(kitchen-sink): add startup entrypoint"
```

---

## Task 5: README

**Files:**
- Create: `packages/examples/src/kitchen-sink/README.md`

### Step 1: Create README

Create `packages/examples/src/kitchen-sink/README.md`:

```markdown
# Kitchen-Sink Example

Demonstrates all major Lucid Agents SDK capabilities in a single runnable project.

## What It Shows

| Module      | Capability                                    |
|-------------|-----------------------------------------------|
| `wallet`    | Local wallet from `AGENT_WALLET_PRIVATE_KEY`  |
| `identity`  | ERC-8004 on-chain agent identity              |
| `payments`  | x402 paid entrypoint (`summarize`)            |
| `analytics` | Payment summary via `analytics-report`        |
| `scheduler` | Active job listing via `scheduler-status`     |
| `a2a`       | Agent card + task-based A2A calls             |
| `ap2`       | AP2 extension in agent manifest               |
| `hono`      | HTTP adapter serving all entrypoints          |

## Quickstart (no wallet)

```bash
bun install
bun run packages/examples/src/kitchen-sink/index.ts
```

## With Wallet (enables identity + payments)

```bash
cp packages/examples/src/kitchen-sink/.env.example .env
# Edit .env with your private key
bun run packages/examples/src/kitchen-sink/index.ts
```

## Environment Variables

| Variable                   | Default                                   | Description                        |
|----------------------------|-------------------------------------------|------------------------------------|
| `AGENT_WALLET_TYPE`        | —                                         | `local` (required for wallet)      |
| `AGENT_WALLET_PRIVATE_KEY` | —                                         | 0x-prefixed private key            |
| `AGENT_DOMAIN`             | `kitchen-sink.example.com`               | ERC-8004 domain                    |
| `AUTO_REGISTER`            | `false`                                   | Register identity on startup       |
| `FACILITATOR_URL`          | `https://facilitator.daydreams.systems`  | x402 facilitator                   |
| `NETWORK`                  | `base-sepolia`                           | Chain network                      |
| `PORT`                     | `8787`                                   | Kitchen-sink server port           |
| `CLIENT_PORT`              | `8788`                                   | Client agent port                  |

## Endpoints

```
POST /entrypoints/echo/invoke           free       Basic HTTP echo
POST /entrypoints/summarize/invoke      0.001 USDC Word/char count
POST /entrypoints/stream/invoke         free       Streaming characters
POST /entrypoints/analytics-report/invoke free     Payment summary
POST /entrypoints/scheduler-status/invoke free     Active jobs
GET  /.well-known/agent-card.json       free       A2A agent card
```

## Example Calls

```bash
# Echo (free)
curl http://localhost:8787/entrypoints/echo/invoke \
  -H 'Content-Type: application/json' \
  -d '{"input":{"text":"hello world"}}'

# Summarize (0.001 USDC — requires wallet)
curl http://localhost:8787/entrypoints/summarize/invoke \
  -H 'Content-Type: application/json' \
  -d '{"input":{"text":"The quick brown fox jumps over the lazy dog"}}'

# Agent card
curl http://localhost:8787/.well-known/agent-card.json | jq .
```

## Running Tests

```bash
bun test packages/examples/src/kitchen-sink/__tests__
```
```

### Step 2: Commit

```bash
git add packages/examples/src/kitchen-sink/README.md
git commit -m "docs(kitchen-sink): add README with setup and endpoint guide"
```

---

## Task 6: Verify — type-check, lint, all tests

### Step 1: Run all kitchen-sink tests

```bash
bun test packages/examples/src/kitchen-sink/__tests__
```

Expected: All tests pass (agent, entrypoints, a2a)

### Step 2: Type-check

```bash
cd packages/examples && bun run type-check
```

Expected: No errors. If there are type errors, fix them before proceeding.

### Step 3: Lint

```bash
cd packages/examples && bun run lint
```

Expected: No errors. Run `bun run lint:fix` to auto-fix style issues.

### Step 4: Final commit (only if fixes were needed)

```bash
git add -p   # stage only what you changed
git commit -m "fix(kitchen-sink): type and lint fixes"
```

---

## Task 7: Submit to Taskmarket

### Step 1: Create submission file

```bash
cat > /tmp/kitchen-sink-submission.md << 'EOF'
# Kitchen-Sink Example — Lucid Agents SDK

Implementation at: `packages/examples/src/kitchen-sink/`

## What was built

A persistent Hono server demonstrating all major SDK capabilities:
- `agent.ts` — factory wiring all 8 extensions (http, wallet, identity, payments, analytics, scheduler, a2a, ap2)
- `entrypoints.ts` — 5 entrypoints: echo (free), summarize (0.001 USDC), stream, analytics-report, scheduler-status
- `client.ts` — second agent that discovers the kitchen-sink via A2A and calls it
- `index.ts` — single command startup (`bun run packages/examples/src/kitchen-sink/index.ts`)
- `README.md` — setup guide and endpoint reference
- `__tests__/` — TDD: agent.test.ts, entrypoints.test.ts, a2a.test.ts

## Run it

```bash
bun install
bun run packages/examples/src/kitchen-sink/index.ts
```

## Tests

```bash
bun test packages/examples/src/kitchen-sink/__tests__
```
EOF
```

### Step 2: Submit to Taskmarket

```bash
npx @lucid-agents/taskmarket task submit \
  0x910ad45ec55c874ae801541a180828e901104ce587880c7612ab62b4bf303230 \
  --file /tmp/kitchen-sink-submission.md
```

Expected: `{ "ok": true, ... }`
