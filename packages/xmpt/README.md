# @lucid-agents/xmpt

Agent-to-agent messaging extension for the [Lucid SDK](https://github.com/daydreamsai/lucid-agents).

## Overview

`@lucid-agents/xmpt` provides a composable extension that enables direct agent-to-agent (A2A) messaging via a lightweight XMPT (eXtensible Message Protocol Transport) inbox. Agents can send messages to peers by URL or Agent Card, receive and reply to inbound messages, and maintain a persistent or in-memory message store.

## Installation

```bash
bun add @lucid-agents/xmpt
```

## Usage

### Basic Setup

```typescript
import { createAgent } from '@lucid-agents/core';
import { xmpt } from '@lucid-agents/xmpt';

const runtime = await createAgent({ name: 'alpha', version: '0.1.0' })
  .use(
    xmpt({
      inbox: {
        handler: async ({ message }) => {
          console.log('Received:', message.content.text);
          return {
            content: { text: `ack: ${message.content.text}` },
          };
        },
      },
    })
  )
  .build();

// Send a message to another agent
const result = await runtime.xmpt.send(
  { url: 'http://other-agent.example.com' },
  { content: { text: 'hello from alpha' } }
);
console.log('Delivered:', result.status);
```

### Send and Wait for Reply

```typescript
const reply = await runtime.xmpt.sendAndWait(
  { url: 'http://other-agent.example.com' },
  { content: { text: 'ping' }, threadId: 'thread-123' },
  { timeoutMs: 5000 }
);
if (reply) {
  console.log('Reply:', reply.content.text);
}
```

### Subscribe to Incoming Messages

```typescript
const unsubscribe = runtime.xmpt.onMessage(async ({ message }) => {
  console.log('Got message from', message.from, ':', message.content.text);
});

// Later, unsubscribe:
unsubscribe();
```

### List Messages

```typescript
// All messages
const all = await runtime.xmpt.listMessages();

// Filter by thread
const thread = await runtime.xmpt.listMessages({ threadId: 'thread-123' });
```

### Peer-by-Agent-Card

```typescript
import { type AgentCard } from '@lucid-agents/types';

const card: AgentCard = {
  name: 'beta-agent',
  url: 'http://beta.example.com',
};

await runtime.xmpt.send({ card }, { content: { text: 'hi beta' } });
```

## API

### `xmpt(options?: XMPTConfig): Extension<{ xmpt: XMPTRuntime }>`

Creates the XMPT extension.

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `inbox.key` | `string` | Custom inbox route key (default: `'xmpt-inbox'`) |
| `inbox.handler` | `XMPTInboxHandler` | Default handler for incoming messages |
| `store` | `XMPTStore` | Custom message store (default: in-memory) |

### `XMPTRuntime`

| Method | Description |
|--------|-------------|
| `send(peer, message, options?)` | Send a message to a peer, returns delivery result |
| `sendAndWait(peer, message, options?)` | Send and wait for a reply, returns reply message or null |
| `receive(message)` | Process an inbound message through registered handlers |
| `onMessage(handler)` | Register a handler, returns unsubscribe function |
| `listMessages(filter?)` | List stored messages, optionally filtered by `threadId` |

### `createXMPTRuntime(options)`

Low-level factory for creating an XMPT runtime without the extension wrapper. Useful for testing and custom integrations.

```typescript
import { createXMPTRuntime, createMemoryStore } from '@lucid-agents/xmpt';

const runtime = createXMPTRuntime({
  store: createMemoryStore(),
  fetchFn: customFetch, // injectable for testing
});
```

## License

MIT
