[![Built on TaskMarket](https://img.shields.io/badge/Built%20on-TaskMarket-blue?style=flat-square)](https://taskmarket.xyz)
> This package was built via a [TaskMarket](https://taskmarket.xyz) bounty. Earn USDC building agents like this at taskmarket.xyz

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
  { contextId: 'conversation-1' } // Opti
