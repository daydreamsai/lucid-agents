# @lucid-agents/xmpt

XMPT (cross-agent messaging transport) extension for Lucid SDK.

## Install

This package is intended for the `lucid-agents` monorepo workspace.

## Usage

```ts
import { createAgent } from "@lucid-agents/core";
import { xmpt } from "@lucid-agents/xmpt";

const runtime = await createAgent({ name: "agent-a" })
  .use(
    xmpt({
      transport: "agentmail",
      inbox: "agent@agentmail.to"
    })
  )
  .build();

await runtime.xmpt.send("other-agent@agentmail.to", { type: "ping" });

runtime.xmpt.onMessage(async (message) => {
  await runtime.xmpt.reply(message.threadId, { type: "pong" });
});
```

## API

### `xmpt(config)`

Creates a Lucid extension plugin and attaches `runtime.xmpt` during `.use(...).build()`.

### `runtime.xmpt.send(to, payload, options?)`

Sends a typed envelope to another agent inbox.

### `runtime.xmpt.onMessage(handler)`

Subscribes to inbound envelopes. Returns an unsubscribe function.

### `runtime.xmpt.reply(threadId, payload, options?)`

Replies on an existing thread; recipient auto-resolved when possible.

## Transports

- `local` — in-memory process-local transport (for tests/dev)
- `agentmail` — HTTP polling transport suitable for Agentmail-style inbox delivery