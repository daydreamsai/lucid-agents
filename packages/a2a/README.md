# @lucid-agents/a2a

A2A agent-card discovery, direct invocation, streaming, and owned asynchronous
tasks for Lucid Agents.

## Install

```bash
bun add @lucid-agents/a2a @lucid-agents/core @lucid-agents/http
```

## Enable A2A tasks

```ts
import { a2a } from '@lucid-agents/a2a';
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';

const agent = await createAgent({ name: 'worker', version: '1.0.0' })
  .use(
    a2a({
      tasks: {
        maxTasks: 1_000,
        retentionMs: 24 * 60 * 60 * 1_000,
        maxRunMs: 15 * 60 * 1_000,
      },
    })
  )
  .use(http())
  .addEntrypoint({
    key: 'summarize',
    handler: async ({ input }) => ({ output: { summary: String(input) } }),
  })
  .build();
```

Installing `a2a()` adds the task runtime and makes HTTP task routes available.
Without it, the agent card does not advertise task support and the task routes
are not mounted.

## Call another agent

The client uses the first HTTP entry in `supportedInterfaces`, falling back to
the deprecated agent-card `url` field. This preserves an advertised base path.

```ts
const card = await agent.a2a.fetchCard('https://worker.example');

const result = await agent.a2a.client.invoke(
  card,
  'summarize',
  { text: 'Long text' },
  undefined,
  { idempotencyKey: 'summary:document-42' }
);
```

For streaming:

```ts
await agent.a2a.client.stream(card, 'summarize', { text: 'Long text' }, event =>
  console.log(event.type, event.data)
);
```

Pass a payment-enabled Fetch implementation in the optional `fetch` position
when the remote entrypoint is priced.

## Task operations

Creating a task returns an opaque ownership capability:

```ts
const access = await agent.a2a.client.sendMessage(card, 'summarize', {
  text: 'Long text',
});

// access = { taskId, accessToken, status: 'running' }
const task = await agent.a2a.client.getTask(card, access);
```

Keep `accessToken` secret. Every read, cancellation, listing, and subscription
requires it. The server persists only its SHA-256 hash, and a request made with a
different token cannot distinguish the task from a missing task.

```ts
import { waitForTask } from '@lucid-agents/a2a';

const completed = await waitForTask(agent.a2a.client, card, access, 30_000);

await agent.a2a.client.subscribeTask(card, access, event => {
  console.log(event.type, event.data);
});

await agent.a2a.client.cancelTask(card, access);

const owned = await agent.a2a.client.listTasks(card, access.accessToken, {
  status: ['running', 'completed'],
  limit: 50,
});
```

Pass `options.accessToken` to `sendMessage` when several tasks should belong to
the same owner and be returned by one `listTasks` call.

## HTTP task contract

With the default empty base path, `@lucid-agents/http` exposes:

| Operation        | Route                          | Access token          |
| ---------------- | ------------------------------ | --------------------- |
| Create           | `POST /tasks`                  | supplied or generated |
| List owned tasks | `GET /tasks`                   | required              |
| Read             | `GET /tasks/:taskId`           | required              |
| Cancel           | `POST /tasks/:taskId/cancel`   | required              |
| Subscribe (SSE)  | `GET /tasks/:taskId/subscribe` | required              |

The token is transported in `Task-Access-Token`. A configured HTTP base path is
also used by these routes and is preserved in agent-card interfaces.

Task creation uses the same authorization gate as direct invoke and stream. A
priced or auth-only entrypoint is verified before a task is reserved, and x402
settlement is finalized before background execution is admitted.

## Storage and state transitions

The default `createInMemoryTaskStore()` is process-local and bounded. It:

- retains at most 1,000 tasks by default;
- expires terminal tasks after 24 hours by default;
- evicts only terminal tasks;
- rejects new work if capacity contains only active tasks;
- delivers owner-isolated update subscriptions.

For restart survival or multiple workers, implement `TaskStore` and inject it:

```ts
import type { TaskStore } from '@lucid-agents/types/a2a';

declare const durableStore: TaskStore;

const agent = await createAgent({ name: 'worker', version: '1.0.0' })
  .use(a2a({ tasks: { store: durableStore, maxRunMs: 60_000 } }))
  .use(http())
  .build();
```

The store contract uses both atomic execution claims and fenced
`compareAndSet` transitions:

- `claimExecution(taskId, ownerId, expiresAt, now)` may claim a running task
  only when it has no live lease;
- an expired lease may be recovered by another worker;
- terminal writes pass `executionOwnerId`, so a stale worker cannot overwrite
  the recovery worker's result;
- `create` and every state transition must be durable before returning;
- subscription delivery must remain isolated by the persisted owner hash.

Valid terminal states are `completed`, `failed`, and `cancelled`; a timeout
fences and marks a still-running task failed. A durable store should use a
database transaction, conditional update, or equivalent compare-and-swap for
both claim and transition operations. `runtime.close()` closes the task runtime
and injected store. It aborts local handlers without marking durable running
tasks cancelled; their leases remain recoverable by another worker.

## Standalone utilities

```ts
import {
  buildAgentCard,
  fetchAgentCard,
  fetchAgentCardWithEntrypoints,
  invokeAgent,
  streamAgent,
  sendMessage,
  getTask,
  listTasks,
  cancelTask,
  subscribeTask,
  createInMemoryTaskStore,
  createTaskRuntime,
} from '@lucid-agents/a2a';
```

Protocol types—including `AgentCard`, `TaskAccess`, `TaskStore`, and
`A2ARuntime`—are defined in `@lucid-agents/types/a2a` rather than re-exported.

## Discovery

HTTP serves the current card at both:

- `/.well-known/agent-card.json` (canonical)
- `/.well-known/agent.json` (legacy compatibility)

The card is origin-aware and includes the current canonical entrypoint registry.
Unknown fields and `supportedInterfaces` are preserved when cards are parsed.
