# @lucid-agents/xmpt

XMPT is the high-level messaging layer for Lucid Agents.

It sits on top of A2A tasks and adds:

- inbox semantics (`xmpt-inbox` by default)
- a normalized message envelope (`id`, `threadId`, `content`, metadata)
- thread-aware `send`, `sendAndWait`, and `receive` APIs
- local message observability (`onMessage`) and history (`listMessages`)
- manifest discovery tags (`xmpt`, `xmpt-inbox`) so peers can find inbox skills

## When to use XMPT

Use XMPT when your agent needs conversation-like messaging between agents:

- multi-step delegation flows where context must persist via `threadId`
- async request/reply patterns where `sendAndWait` is simpler than raw task polling
- inbox behavior for peer-to-peer agent messaging
- local transcript/history or analytics hooks through the pluggable store

Use plain A2A directly when you only need one-off skill invocation and do not need messaging semantics.

## Delivery and failure semantics

- A2A delivery failures throw and fail `send`/`sendAndWait`
- timeout waiting for task completion throws `XMPT_TIMEOUT`
- local store append failures are best-effort and do not fail delivery
- `onMessage` subscriber failures are best-effort and do not fail delivery

## Install

```bash
bun add @lucid-agents/xmpt
```

## Quick start

```ts
import { createAgent } from '@lucid-agents/core';
import { a2a } from '@lucid-agents/a2a';
import { http } from '@lucid-agents/http';
import { xmpt } from '@lucid-agents/xmpt';

const runtime = await createAgent({
  name: 'alpha',
  version: '0.1.0',
})
  .use(http())
  .use(a2a())
  .use(
    xmpt({
      inbox: {
        handler: async ({ message }) => ({
          content: { text: `ack:${message.content.text ?? ''}` },
        }),
      },
    })
  )
  .build();

await runtime.xmpt?.send(
  { url: 'http://localhost:8788' },
  { content: { text: 'hello' }, threadId: 't-1' }
);
```

## API overview

`runtime.xmpt` exposes:

- `send(peer, message, options?)` - deliver a message and return task metadata
- `sendAndWait(peer, message, options?)` - deliver and wait for task completion
- `receive(message)` - process an inbound XMPT message (inbox entrypoint uses this)
- `onMessage(handler)` - subscribe to inbound message events
- `listMessages(filters?)` - query local message records

### `sendAndWait` example

```ts
const result = await runtime.xmpt!.sendAndWait(
  { url: 'https://beta.example.com' },
  {
    threadId: 'portfolio-rebalance-42',
    content: { text: 'calculate hedge ratio' },
  },
  { timeoutMs: 15_000 }
);

console.log(result.delivery.taskId);
console.log(result.task.status);
console.log(result.task.result?.output);
```

### Message observability and history

```ts
const unsubscribe = runtime.xmpt!.onMessage(message => {
  console.log('Inbound message:', message.threadId, message.content.text);
});

const threadHistory = await runtime.xmpt!.listMessages({
  threadId: 'portfolio-rebalance-42',
});

unsubscribe();
```

## Configuration

```ts
xmpt({
  inbox: {
    key: 'custom-inbox',
    handler: async ({ message }) => ({
      content: { text: `ack:${message.content.text ?? ''}` },
    }),
  },
  discovery: {
    preferredSkillId: 'custom-inbox',
  },
  store: myStore,
});
```

### Options

- `inbox.key` - inbox entrypoint key (defaults to `xmpt-inbox`)
- `inbox.handler` - optional handler to process inbound messages and produce a reply
- `discovery.preferredSkillId` - preferred remote skill id during inbox resolution
- `store` - pluggable local store for message records (`append`, `list`)

## Use cases

- Supervisor/worker orchestration where every job runs in a thread
- Facilitator agents that route requests across specialist agents
- Cross-agent negotiation loops that need durable conversation IDs
- Human-in-the-loop systems that need local message audit trails

## Running the working example

A local two-agent XMPT example is available at:

- `packages/examples/src/xmpt/local-messaging.ts`

Run it from repo root:

```bash
bun run packages/examples/src/xmpt/local-messaging.ts
```

This example starts two agents (`alpha`, `beta`), sends a message with `sendAndWait`, and prints delivery status plus thread history.

## Error codes

XMPT throws structured `XMPTError` instances with these codes:

- `XMPT_PEER_UNREACHABLE`
- `XMPT_INBOX_SKILL_MISSING`
- `XMPT_INVALID_MESSAGE_PAYLOAD`
- `XMPT_TIMEOUT`
