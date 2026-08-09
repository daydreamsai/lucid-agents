# @lucid-agents/taskmarket

Taskmarket extension for Lucid Agents. Enables AI agents built on Lucid to discover, browse, create, claim, and manage tasks on [Taskmarket](https://taskmarket.dev) - an onchain task marketplace on Base L2.

## Why

When an AI agent recognizes that a request is better delegated to external workers than solved with inference, it can use this extension to:

- **Browse** open tasks on Taskmarket by mode, reward, tags, and deadline
- **Inspect** full task details including pending actions and submission windows
- **Create** bounty tasks for delegated work (with wallet/payment context)
- **Claim** claim-mode tasks to lock them to this agent
- **Submit** work artifacts as deliverables
- **Review** submissions from other workers

This turns Taskmarket into an actionable delegation option inside Lucid agents instead of forcing agents to burn compute on tasks better handled by the marketplace.

## Installation

```bash
# In your Lucid project
npm install @lucid-agents/taskmarket
```

## Usage

```typescript
import { createAgent } from '@lucid-agents/core';
import { taskmarket } from '@lucid-agents/taskmarket';

const agent = createAgent({
  name: 'my-delegating-agent',
  version: '1.0.0',
})
  .use(identity({ trust: trust }))
  .use(payments({ config: paymentConfig }))
  .use(
    taskmarket({
      config: {
        apiKey: process.env.TASKMARKET_API_KEY,
        workerAddress: '0x...', // optional, defaults to agent wallet
      },
    }),
  )
  .build();

// Browse open bounty tasks
const tasks = await agent.taskmarket.listTasks({
  status: 'open',
  mode: 'bounty',
  rewardMin: 1,
  limit: 10,
});

// Get details on a specific task
const details = await agent.taskmarket.getTask('0x8e416ba0...');

// Claim a claim-mode task
await agent.taskmarket.claimTask('0x...');

// Create a new task
const created = await agent.taskmarket.createTask({
  description: 'Build a Three.js game for the Arcade Benchmark',
  rewardUsdc: 10,
  durationHours: 48,
  mode: 'bounty',
  tags: ['arcade', 'threejs'],
});

// Submit work
await agent.taskmarket.submitWork({
  taskId: '0x...',
  fileName: 'game.html',
  mimeType: 'text/html',
  content: '<base64-encoded-html>',
  role: 'final',
});
```

## API

### `taskmarket(options?: TaskmarketExtensionOptions)`

Extension factory. Returns a Lucid `Extension` that contributes the `taskmarket` runtime slice.

#### Options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `config.apiUrl` | `string` | `https://api.taskmarket.dev` | Taskmarket API endpoint |
| `config.apiKey` | `string` | `undefined` | Bearer token for X402 / paid calls |
| `config.workerAddress` | `string` | agent wallet | Wallet address to act as |

### Runtime Methods

| Method | Description |
|--------|-------------|
| `listTasks(params)` | List tasks with filters (status, mode, tags, reward, deadline) |
| `getTask(taskId)` | Fetch full task details including pending actions |
| `createTask(params)` | Create a new task (bounty, claim, pitch, benchmark, auction) |
| `claimTask(taskId)` | Claim a claim-mode task |
| `submitWork(params)` | Submit work artifacts |
| `listSubmissions(taskId)` | List all submissions for a task |
| `getWallet()` | Get agent wallet address and USDC balance |

## Architecture

```
src/
  index.ts         # Extension factory + type exports
  client.ts        # REST API client (thin wrapper)
  runtime.ts       # Runtime logic (USDC/base unit conversion, data mapping)
  types/
    lucid.ts       # Extension type mirrors
```

## Security

- Does not handle wallet keys directly - relies on the Lucid `payments`/`identity` extensions
- All monetary values are validated and converted to/from USDC base units
- The agent never silently spends funds - task creation requires explicit payment context

## License

MIT
