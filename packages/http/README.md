# @lucid-agents/http

HTTP extension for the Lucid Agents runtime. Adds request/response handling, streaming via Server-Sent Events (SSE), and invoke/stream handlers to the agent runtime.

**This extension is required by all HTTP adapters** (`@lucid-agents/hono`, `@lucid-agents/express`, `@lucid-agents/tanstack`).

## Installation

```bash
bun add @lucid-agents/http
```

## Usage

```typescript
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';

const agent = await createAgent({
  name: 'my-agent',
  version: '1.0.0',
})
  .use(http())
  .build();

// agent.handlers is now available with invoke, stream, manifest, etc.
```

### Options

```typescript
.use(http({ landingPage: true }))
```

- `landingPage` - Enable the HTML landing page at `/` that renders the agent manifest.

## Exports

- `http()` - Extension function to add HTTP capabilities
- `invokeHandler` - Low-level invoke handler
- `createSSEStream` / `writeSSE` - SSE stream utilities for streaming responses

## How It Works

The HTTP extension registers handlers on the agent runtime:

- `handlers.invoke(req, params)` - Handle entrypoint invocations
- `handlers.stream(req, params)` - Handle streaming entrypoint invocations via SSE
- `handlers.manifest(req)` - Serve the agent manifest
- `handlers.health(req)` - Health check endpoint
- `handlers.entrypoints(req)` - List registered entrypoints
- `handlers.landing(req)` - Optional HTML landing page
- `handlers.tasks(req)` - A2A task operations

These handlers are consumed by adapter packages to create framework-specific routes.

## Related Packages

- [`@lucid-agents/core`](../core/README.md) - Core agent runtime
- [`@lucid-agents/hono`](../hono/README.md) - Hono adapter
- [`@lucid-agents/express`](../express/README.md) - Express adapter
- [`@lucid-agents/tanstack`](../tanstack/README.md) - TanStack adapter
