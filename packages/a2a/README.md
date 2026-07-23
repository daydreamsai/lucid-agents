# @lucid-agents/a2a

A2A Agent Card-shaped discovery plus Lucid-specific direct invocation,
streaming, and owned asynchronous tasks.

> Compatibility boundary: this package does not implement an official A2A v1
> JSON-RPC, gRPC, or HTTP+JSON binding. Its `/entrypoints` and `/tasks` routes,
> task statuses, message shape, access tokens, and SSE events are Lucid
> contracts; `A2A-Version` negotiation and the A2A TCK are not implemented.
> Do not claim blanket A2A v1 conformance.

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

// access = { taskId, accessToken, status, idempotencyKey, settlement? }
const task = await agent.a2a.client.getTask(card, access);
```

Keep `accessToken` secret. Every read, cancellation, listing, and subscription
requires it. The server persists only its SHA-256 hash, and a request made with a
different token cannot distinguish the task from a missing task.

`sendMessage()` sends caller-known access and idempotency keys even when you do
not provide them. A successful result returns both keys plus any
`Payment-Receipt`, `Payment-Response`, or `X-Payment-Response` evidence. If the
network fails, the response is malformed, or the server returns non-2xx, it
throws `TaskCreationError` with the same keys, response details, any parsed task
capability, and settlement evidence:

```ts
import { TaskCreationError, waitForTask } from '@lucid-agents/a2a';

try {
  await agent.a2a.client.sendMessage(card, 'summarize', input);
} catch (error) {
  if (!(error instanceof TaskCreationError)) throw error;

  // Reconcile durable task state before deciding whether to retry.
  const possiblyCreated = await agent.a2a.client.listTasks(
    card,
    error.accessToken
  );
  console.log(possiblyCreated.tasks, error.settlement);
}

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
the same owner and be returned by one `listTasks` call. Pass
`options.idempotencyKey` to reuse a payment-provider deduplication key. Task
creation itself is not target-side idempotent: after an interrupted response,
list/reconcile the durable task before retrying.

## HTTP task contract

The routes below are the Lucid HTTP profile, not the official A2A v1
HTTP+JSON operation contract.

With the default empty base path, `@lucid-agents/http` exposes:

| Operation        | Route                          | Access token                         |
| ---------------- | ------------------------------ | ------------------------------------ |
| Create           | `POST /tasks`                  | supplied for paid; optional for free |
| List owned tasks | `GET /tasks`                   | required                             |
| Read             | `GET /tasks/:taskId`           | required                             |
| Cancel           | `POST /tasks/:taskId/cancel`   | required                             |
| Subscribe (SSE)  | `GET /tasks/:taskId/subscribe` | required                             |

The token is transported in `Task-Access-Token`. A configured HTTP base path is
also used by these routes and is preserved in agent-card interfaces. Paid task
creation requires the caller to supply this token so the capability is known
before settlement begins; `sendMessage()` does this automatically. Free task
creation may continue to use a server-generated token.

Task creation uses the same authorization gate as direct invoke and stream. An
initial MPP challenge does not consume task capacity. A credential-bearing MPP
request pre-reserves durable task state before verification can settle it.
Unclaimed admission records carry an expiry that every `TaskStore` must reap
before enforcing capacity, so a crashed verifier cannot strand a slot forever.
The runtime holds a renewable `prepared` execution claim while authorization
finalizes, then atomically activates that claim before starting the handler and
its execution timeout. Once any rail is irreversible, a later execution-start
or accounting failure returns its receipt with a queryable terminal task
capability instead of discarding either.

Paid tasks fail closed with `durable_task_store_required` when the configured
store declares `durability: 'process'`. This includes the default in-memory
store. Free tasks continue to work with the portable default.

These guarantees cover every response path within a running worker. An external
payment rail and a task database cannot form one distributed transaction across
abrupt process loss. Production verifiers must therefore use the caller's
idempotency key for settlement deduplication and support provider-side receipt
reconciliation. The caller-known task token lets clients recover the durable
task even if the creation response is interrupted; `TaskCreationError` exposes
both generated recovery keys when that happens.

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

The store contract uses two-phase execution claims and fenced `compareAndSet`
transitions:

- `durability` must truthfully declare whether records and leases survive a
  process restart;
- `reapExpiredAdmissions(now)` must terminalize abandoned reservations and
  expired `prepared` claims before capacity is enforced;
- `claimExecution(...)` creates a `prepared` lease only when no live lease
  exists;
- `renewExecutionClaim(...)` extends only the current owner's live `prepared`
  lease;
- `activateExecution(...)` atomically changes that lease to `active`;
- an expired `active` lease may be recovered by another worker;
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

## Migrating a custom `TaskStore`

This release intentionally changes the public task-store contract. Existing
stores must:

1. add `durability: 'durable'` only when task records and lease mutations
   survive worker restarts, otherwise use `'process'`;
2. persist `StoredTask.admissionExpiresAt` and the execution-lease `phase`;
3. implement atomic `reapExpiredAdmissions`, `renewExecutionClaim`, and
   `activateExecution` operations with the ownership checks described above;
4. treat `claimExecution` as preparation, not permission to run the handler.

Clients should also handle every `TaskStatus` in `SendMessageResponse.status`.
After an irreversible payment, admission failure can return a durable terminal
capability (`failed`, `cancelled`, or `completed`) rather than a fabricated
`running` response.

The store persists task state and leases, not JavaScript handler closures. A
multi-worker host that recovers an expired active lease must call
`execute(taskId, options)` with the original durable invocation payload and
execution callback.

## Standalone utilities

```ts
import {
  buildAgentCard,
  fetchAgentCard,
  fetchAgentCardWithEntrypoints,
  invokeAgent,
  streamAgent,
  sendMessage,
  TaskCreationError,
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
