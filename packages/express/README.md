# @lucid-agents/express

Express HTTP server adapter for Lucid Agents. Converts an agent runtime into an Express-compatible application.

## Installation

```bash
bun add @lucid-agents/express
```

## Usage

```typescript
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { createAgentApp } from '@lucid-agents/express';
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

app.listen(process.env.PORT ?? 3000);
```

## API

### `createAgentApp(runtime, options?)`

Creates an Express app from an agent runtime.

**Parameters:**

- `runtime: AgentRuntime` - Built agent runtime (must include HTTP extension)

**Returns:** `Promise<{ app, runtime, agent, addEntrypoint }>`

- `app` - Express instance with all routes registered
- `addEntrypoint(def)` - Register a new entrypoint

### `withPayments`

x402 payment middleware for Express routes.

## Related Packages

- [`@lucid-agents/core`](../core/README.md) - Core agent runtime
- [`@lucid-agents/http`](../http/README.md) - HTTP extension (required)
- [`@lucid-agents/hono`](../hono/README.md) - Hono adapter (alternative)
- [`@lucid-agents/tanstack`](../tanstack/README.md) - TanStack adapter (alternative)
