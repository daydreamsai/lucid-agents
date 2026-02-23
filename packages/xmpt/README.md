# @lucid-agents/xmpt

XMPT is a high-level messaging extension for Lucid agents.

It provides:

- inbox semantics (`xmpt-inbox` by default)
- thread-aware send/receive APIs
- local message observability with a pluggable store
- manifest discoverability tags for XMPT inbox skills

Runtime semantics:

- A2A delivery errors fail `send`/`sendAndWait`
- local message-store persistence and `onMessage` subscriber failures are best-effort and do not fail delivery

## Install

```bash
bun add @lucid-agents/xmpt
```

## Usage

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
