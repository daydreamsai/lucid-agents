# @lucid-agents/tanstack

TanStack Start adapter for Lucid Agents. Supports both full UI dashboard and headless API-only modes.

## Installation

```bash
bun add @lucid-agents/tanstack
```

## Usage

```typescript
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { createTanStackRuntime } from '@lucid-agents/tanstack';

const agent = await createAgent({
  name: 'my-agent',
  version: '1.0.0',
})
  .use(http())
  .build();

export const { runtime: tanStackRuntime, handlers } =
  await createTanStackRuntime(agent);
```

## API

### `createTanStackRuntime(runtime)`

Creates TanStack-compatible handlers from an agent runtime.

**Returns:** `Promise<{ runtime, handlers }>`

- `runtime` - TanStack runtime with entrypoint management
- `handlers` - Route handlers for TanStack Start routes

### `createTanStackHandlers(runtime)`

Lower-level function to create individual route handlers.

### `createTanStackPaywall(options)`

Create payment middleware for TanStack routes.

### `paymentMiddleware`

x402 payment middleware for TanStack request handlers.

## Variants

- **`tanstack-ui`** - Full dashboard with wallet integration, entrypoint testing, and schema forms
- **`tanstack-headless`** - API-only mode without UI components

Select the variant when using the CLI: `--adapter=tanstack-ui` or `--adapter=tanstack-headless`.

## Related Packages

- [`@lucid-agents/core`](../core/README.md) - Core agent runtime
- [`@lucid-agents/http`](../http/README.md) - HTTP extension (required)
- [`@lucid-agents/hono`](../hono/README.md) - Hono adapter (alternative)
- [`@lucid-agents/express`](../express/README.md) - Express adapter (alternative)
