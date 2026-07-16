# @lucid-agents/core

The protocol-neutral Lucid Agents runtime kernel: typed extension composition,
one entrypoint registry, origin-aware manifest construction, and deterministic
lifecycle management.

Core does not mount HTTP routes or enforce payments. Install extensions for
those capabilities.

## Quick start

```bash
bun add @lucid-agents/core @lucid-agents/http @lucid-agents/hono zod
```

```ts
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { createAgentApp } from '@lucid-agents/hono';
import { z } from 'zod';

const runtime = await createAgent({
  name: 'greeter',
  version: '1.0.0',
  description: 'Returns typed greetings',
})
  .use(http())
  .addEntrypoint({
    key: 'greet',
    description: 'Greet a person',
    input: z.object({ name: z.string().min(1) }),
    output: z.object({ message: z.string() }),
    handler: async ({ input }) => ({
      output: { message: `Hello, ${input.name}` },
    }),
  })
  .build();

const { app } = await createAgentApp(runtime);
export default app;
```

## Runtime shape

The base runtime contains only kernel services:

```ts
runtime.agent; // read-only metadata and canonical entrypoint view
runtime.entrypoints; // add, list, snapshot
runtime.manifest; // build(origin), invalidate()
runtime.close(); // idempotent reverse-order cleanup
```

Each extension adds its own exact slice. TypeScript therefore exposes
`runtime.http` only after `http()`, `runtime.payments` only after `payments()`,
and so on. Core does not maintain optional placeholder keys for known protocols.

## Extension composition

```ts
const runtime = await createAgent(meta)
  .use(wallets({ config: walletsFromEnv() }))
  .use(payments({ config: paymentsFromEnv() }))
  .use(a2a())
  .use(scheduler())
  .use(http({ basePath: '/api/agent' }))
  .build();
```

An extension declares a unique `name`, typed capability requirements, runtime
`requires`, and optional `before`/`after` constraints. Build performs a stable
topological sort, then:

1. calls each extension `build` sequentially;
2. attaches the returned runtime slice directly;
3. registers all builder entrypoints in the one registry;
4. calls `initialize` sequentially.

Missing requirements are caught by the builder type and validated again at
runtime. Duplicate extension names, dependency cycles, property collisions,
duplicate entrypoint keys, and invalid slices are errors.

If setup fails, already-built extensions are disposed in reverse dependency
order. A successful runtime's `close()` is idempotent and uses the same reverse
order.

### Extension contract

```ts
import type { BuildContext, Extension } from '@lucid-agents/types/core';

type DatabaseRuntime = { query(sql: string): Promise<unknown[]> };

export function database(): Extension<{ database: DatabaseRuntime }> {
  let connection: DatabaseRuntime | undefined;
  return {
    name: 'database',
    async build(_ctx: BuildContext) {
      connection = await connectDatabase();
      return { database: connection };
    },
    async dispose() {
      await closeDatabase(connection);
    },
  };
}
```

Use `onEntrypointAdded` to validate or activate against every canonical
entrypoint, `initialize` for work that needs the completed runtime, and
`onManifestBuild` to contribute discovery metadata. Domain complexity belongs
inside the extension; return the complete capability consumers need.

## Entrypoints

Entrypoints may be registered before or after build:

```ts
runtime.entrypoints.add({
  key: 'status',
  handler: async ({ runtime, signal, metadata, auth }) => ({
    output: { ok: !signal.aborted },
  }),
});
```

All registration paths enter the same registry and run extension validation
hooks. Dynamic entrypoints immediately appear in adapter routing (dynamic
`:key` routes), entrypoint listings, and newly built manifests. Duplicate keys
are rejected instead of overwriting existing behavior.

Handler context contains:

- typed `input` when an input Zod schema is present;
- `signal` for cancellation;
- `runtime` with the exact installed capabilities;
- `metadata.headers` for transport metadata;
- `runId` when invoked through HTTP;
- verified SIWX `auth` when authorization granted it.

Output is validated against the output schema. Input validation returns a 400 in
HTTP; invalid handler output and handler exceptions return a 500. Authorization
finalization still runs for all of those paths.

## Streaming

Add a `stream` handler for SSE output:

```ts
.addEntrypoint({
  key: 'story',
  input: z.object({ topic: z.string() }),
  stream: async ({ input }, emit) => {
    await emit({ kind: 'text', text: `A story about ${input.topic}` });
    await emit({ kind: 'delta', delta: '...', final: true });
    return { output: { complete: true }, status: 'succeeded' };
  },
})
```

Streaming envelope types live in `@lucid-agents/types/http` because the SSE
protocol is owned by the HTTP package.

## Adapters

Every adapter consumes the completed HTTP runtime:

```ts
import { createAgentApp as createHonoAgentApp } from '@lucid-agents/hono';
import { createAgentApp as createExpressAgentApp } from '@lucid-agents/express';

// Hono
const { app, runtime, addEntrypoint } = await createHonoAgentApp(agent);

// Express
const { app } = await createExpressAgentApp(agent);
app.listen(3000);

// TanStack Start
const { handlers, routes } = await createTanStackRuntime(agent);
```

Hono and Express bind `runtime.http.routes`, the canonical route plan. TanStack
and generated Next/TanStack modules delegate to `runtime.http.handlers`. Payment
and SIWX middleware is not duplicated in adapters.

## Manifest and discovery

`runtime.manifest.build(origin)` returns an origin-specific agent card populated
from the current entrypoint registry. Extension `onManifestBuild` hooks add
payments, identity, A2A, AP2, and other metadata. Results are cached by origin;
`runtime.entrypoints.add()` invalidates the cache.

The HTTP extension serves the card at
`/.well-known/agent-card.json` and the legacy `/.well-known/agent.json` alias.
Use its manifest handler in framework compatibility routes so there is only one
cache and one origin calculation.

## Payments and payment rails

Core entrypoints only declare protocol-neutral pricing metadata:

```ts
{
  key: 'quote',
  price: { invoke: '0.01', stream: '0.001' },
  paymentProtocol: 'x402',
  network: 'eip155:84532',
}
```

`@lucid-agents/payments` owns x402 and SIWX. `@lucid-agents/mpp` owns MPP. The
HTTP extension invokes the selected runtime through one authorization gate. If
both payment extensions are installed, a priced entrypoint must choose
`'x402'` or `'mpp'` explicitly.

## Shared types

Canonical contracts are defined in scoped subpaths:

```ts
import type {
  AgentRuntime,
  EntrypointDef,
  Extension,
} from '@lucid-agents/types/core';
import type { AgentCard } from '@lucid-agents/types/a2a';
import type { AgentHttpRuntime } from '@lucid-agents/types/http';
```

Public implementations should import each concept from its owning package and
avoid creating parallel “internal” versions of runtime types.

## Shutdown

Always close a long-lived runtime:

```ts
process.once('SIGTERM', async () => {
  await runtime.close();
  process.exit(0);
});
```

This closes task stores, payment/SIWX storage, schedulers, and any custom
extension resources in dependency-safe order.
