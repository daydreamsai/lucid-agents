# @lucid-agents/a2a

Complete A2A Protocol implementation for Lucid agents. Enables agent-to-agent communication, Agent Card discovery, and task-based operations.

## What is A2A?

The [A2A Protocol](https://a2a-protocol.org/) (Agent-to-Agent Protocol) is a standardized way for AI agents to discover and communicate with each other. It provides:

- **Agent Discovery**: Agents expose Agent Cards describing their capabilities
- **Task-Based Operations**: Long-running tasks with status tracking and cancellation
- **Multi-Turn Conversations**: Context tracking across multiple interactions
- **Streaming Support**: Real-time streaming responses via SSE

## Installation

```bash
bun add @lucid-agents/a2a
```

## Quick Start

### Building Agent Cards

```typescript
import { createAgent } from '@lucid-agents/core';
import { a2a } from '@lucid-agents/a2a';

const agent = await createAgent({
  name: 'my-agent',
  version: '1.0.0',
})
  .use(a2a())
  .build();

// Build Agent Card
const card = runtime.a2a.buildCard('https://my-agent.example.com');
console.log(card.name); // 'my-agent'
console.log(card.skills); // Array of skills/entrypoints
```

### Fetching Other Agents' Cards

```typescript
// Fetch another agent's card
const otherAgentCard = await runtime.a2a.fetchCard('https://other-agent.example.com');

// Find a specific skill
import { findSkill } from '@lucid-agents/a2a';
const echoSkill = findSkill(otherAgentCard, 'echo');
```

### Calling Other Agents (Direct Invocation)

```typescript
// Synchronous invocation
const result = await runtime.a2a.client.invoke(otherAgentCard, 'echo', {
  text: 'Hello, agent!',
});

console.log(result.output); // { text: 'Echo: Hello, agent!' }
console.log(result.usage); // { total_tokens: 10 }
```

### Task-Based Operations

```typescript
// Create a task (returns immediately)
const { taskId } = await runtime.a2a.client.sendMessage(
  otherAgentCard,
  'process',
  { data: [1, 2, 3] },
  undefined,
  { contextId: 'conversation-1' } // Optional: for multi-turn conversations
);

// Get task status
const task = await runtime.a2a.client.getTask(otherAgentCard, taskId);
console.log(task.status); // 'running' | 'completed' | 'failed' | 'cancelled'

// Wait for task completion
import { waitForTask } from '@lucid-agents/a2a';
const completedTask = await waitForTask(runtime.a2a.client, otherAgentCard, taskId);
console.log(completedTask.result?.output);
```

### Multi-Turn Conversations

```typescript
const contextId = 'conversation-123';

// First message
const { taskId: task1 } = await runtime.a2a.client.sendMessage(
  otherAgentCard,
  'chat',
  { message: 'Hello' },
  undefined,
  { contextId }
);

// Second message in same conversation
const { taskId: task2 } = await runtime.a2a.client.sendMessage(
  otherAgentCard,
  'chat',
  { message: 'How are you?' },
  undefined,
  { contextId }
);

// List all tasks in conversation
const conversationTasks = await runtime.a2a.client.listTasks(otherAgentCard, {
  contextId,
});
console.log(`Found ${conversationTasks.tasks.length} tasks in conversation`);
```

### Task Management

```typescript
// List tasks with filtering
const allTasks = await a2a.client.listTasks(otherAgentCard);
const runningTasks = await a2a.client.listTasks(otherAgentCard, {
  status: 'running',
});
const conversationTasks = await a2a.client.listTasks(otherAgentCard, {
  contextId: 'conversation-1',
  status: ['completed', 'failed'],
});

// Pagination
const page1 = await a2a.client.listTasks(otherAgentCard, {
  limit: 10,
  offset: 0,
});

// Cancel a running task
await a2a.client.cancelTask(otherAgentCard, taskId);
```

### Streaming Responses

```typescript
await a2a.client.stream(otherAgentCard, 'generate', { prompt: '...' }, async chunk => {
  console.log(chunk.type, chunk.data);
  // 'delta' { text: 'Hello' }
  // 'delta' { text: ' world' }
  // 'done' { output: {...}, usage: {...} }
});
```

### Convenience Functions

```typescript
import { fetchAndInvoke, fetchAndSendMessage } from '@lucid-agents/a2a';

// Fetch card and invoke in one call
const result = await fetchAndInvoke(
  'https://other-agent.example.com',
  'echo',
  { text: 'Hello' }
);

// Fetch card and send message in one call
const { taskId } = await fetchAndSendMessage(
  'https://other-agent.example.com',
  'process',
  { data: [...] }
);
```

## API Reference

### `createA2ARuntime(runtime, options?)`

Creates an A2A runtime from an AgentRuntime. Always returns a runtime (A2A is always available).

```typescript
import { createA2ARuntime } from '@lucid-agents/a2a';
import { createAgentRuntime } from '@lucid-agents/core';

const runtime = createAgentRuntime({ name: 'my-agent', version: '1.0.0' });
const a2a = createA2ARuntime(runtime);
```

### `buildAgentCard(options)`

Builds a base A2A-compliant Agent Card. Does NOT include payments, identity, or AP2 extensions.

```typescript
import { buildAgentCard } from '@lucid-agents/a2a';

const card = buildAgentCard({
  meta: { name: 'my-agent', version: '1.0.0' },
  registry: entrypoints,
  origin: 'https://my-agent.example.com',
});
```

### `fetchAgentCard(baseUrl, fetch?)`

Fetches an Agent Card from `/.well-known/agent-card.json`.

```typescript
import { fetchAgentCard } from '@lucid-agents/a2a';

const card = await fetchAgentCard('https://other-agent.example.com');
```

### Client Methods

The A2A client provides the following methods:

- **`invoke(card, skillId, input, fetch?)`** - Synchronous invocation
- **`stream(card, skillId, input, emit, fetch?)`** - Streaming invocation
- **`sendMessage(card, skillId, input, fetch?, options?)`** - Create task
- **`getTask(card, taskId, fetch?)`** - Get task status
- **`listTasks(card, filters?, fetch?)`** - List tasks with filtering
- **`cancelTask(card, taskId, fetch?)`** - Cancel running task
- **`subscribeTask(card, taskId, emit, fetch?)`** - Subscribe to task updates via SSE
- **`fetchAndInvoke(baseUrl, skillId, input, fetch?)`** - Convenience: fetch + invoke
- **`fetchAndSendMessage(baseUrl, skillId, input, fetch?)`** - Convenience: fetch + sendMessage

### Utilities

- **`findSkill(card, skillId)`** - Find a skill in an Agent Card
- **`parseAgentCard(json)`** - Parse Agent Card JSON
- **`waitForTask(client, card, taskId, maxWaitMs?)`** - Poll for task completion

## Task Lifecycle

1. **Create**: `sendMessage()` returns `{ taskId, status: 'running' }` immediately
2. **Execute**: Task runs asynchronously in the background
3. **Update**: Status changes to `completed`, `failed`, or `cancelled`
4. **Retrieve**: Use `getTask()` or `subscribeTask()` to get updates
5. **Complete**: Task contains `result` (on success) or `error` (on failure)

## Multi-Turn Conversations

Use `contextId` to group related tasks in a conversation:

```typescript
const contextId = `conversation-${Date.now()}`;

// All tasks with same contextId belong to same conversation
await a2a.client.sendMessage(card, 'chat', { message: 'Hello' }, undefined, {
  contextId,
});
await a2a.client.sendMessage(card, 'chat', { message: 'How are you?' }, undefined, {
  contextId,
});

// List all tasks in conversation
const tasks = await a2a.client.listTasks(card, { contextId });
```

## Facilitating Agent Pattern

Agents can act as both clients and servers, enabling agent composition:

```typescript
// Agent 2 (Facilitator) receives call from Agent 3
addEntrypoint({
  key: 'process',
  handler: async ctx => {
    // Agent 2 calls Agent 1 (Worker)
    const agent1Card = await a2a.fetchCard('http://agent1:8787');
    const { taskId } = await a2a.client.sendMessage(agent1Card, 'process', ctx.input);
    const task = await waitForTask(a2a.client, agent1Card, taskId);

    // Return Agent 1's result to Agent 3
    return { output: task.result?.output, usage: task.result?.usage };
  },
});
```

See `packages/a2a/examples/full-integration.ts` for a complete example.

## Related Packages

- `@lucid-agents/core` - Core agent runtime
- `@lucid-agents/ap2` - AP2 extension for Agent Cards
- `@lucid-agents/payments` - Payment utilities for paid agent calls
- `@lucid-agents/types` - Shared type definitions

## Resources

- [A2A Protocol Specification](https://a2a-protocol.org/latest/specification/) - Complete protocol documentation
- [A2A Protocol Overview](https://a2a-protocol.org/) - Protocol introduction and concepts
- [Full Integration Example](examples/full-integration.ts) - Complete facilitating agent example

