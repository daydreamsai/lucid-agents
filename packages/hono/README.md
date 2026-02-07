# @lucid-agents/hono

Hono HTTP server adapter for Lucid Agents. Converts an agent runtime into a [Hono](https://hono.dev/) application with all routes pre-configured.

## Installation

```bash
bun add @lucid-agents/hono
```

## Usage

```typescript
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { createAgentApp } from '@lucid-agents/hono';
import { z } from 'zod';

const agent = await createAgent({
  name: 'my-agent',
  version: '1.0.0',
})
  .use(http())
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

addEntrypoint({
  key: 'echo',
  description: 'Echo a message',
  input: z.object({ text: z.string() }),
  async handler({ input }) {
    return { output: { text: input.text } };
  },
});

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
};
```

## API

### `createAgentApp(runtime, options?)`

Creates a Hono app from an agent runtime.

**Parameters:**

- `runtime: AgentRuntime` - Built agent runtime (must include HTTP extension)
- `options.beforeMount?` - Hook to register custom middleware before agent routes
- `options.afterMount?` - Hook to register additional routes after agent routes

**Returns:** `Promise<{ app, runtime, agent, addEntrypoint }>`

- `app` - Hono instance with all routes registered
- `runtime` - The agent runtime
- `agent` - The agent metadata
- `addEntrypoint(def)` - Register a new entrypoint (adds routes automatically)

### Routes

The adapter registers:

- `GET /health` - Health check
- `GET /entrypoints` - List entrypoints
- `GET /.well-known/agent.json` - Agent manifest (A2A Protocol)
- `GET /.well-known/agent-card.json` - Agent manifest (alternate path)
- `POST /entrypoints/:key/invoke` - Invoke an entrypoint
- `POST /entrypoints/:key/stream` - Stream an entrypoint (SSE)
- `POST /tasks` - Create A2A task
- `GET /tasks` - List tasks
- `GET /tasks/:taskId` - Get task status
- `POST /tasks/:taskId/cancel` - Cancel task
- `GET /tasks/:taskId/subscribe` - Subscribe to task updates (SSE)
- `GET /` - Landing page (if enabled)

### `withPayments`

x402 payment middleware that wraps entrypoint routes with paywall enforcement.

## Related Packages

- [`@lucid-agents/core`](../core/README.md) - Core agent runtime
- [`@lucid-agents/http`](../http/README.md) - HTTP extension (required)
- [`@lucid-agents/express`](../express/README.md) - Express adapter (alternative)
- [`@lucid-agents/tanstack`](../tanstack/README.md) - TanStack adapter (alternative)
