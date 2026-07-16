# @lucid-agents/core contributor guide

`@lucid-agents/core` is the protocol-neutral runtime kernel. It owns extension
composition, the canonical entrypoint registry, origin-aware manifest assembly,
and lifecycle cleanup. It does not own HTTP routing, payment verification,
wallets, identity registration, A2A tasks, or framework adapters.

## Public construction pattern

```ts
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';

const runtime = await createAgent({
  name: 'example',
  version: '1.0.0',
})
  .use(http())
  .addEntrypoint({
    key: 'echo',
    handler: async ({ input }) => ({ output: input }),
  })
  .build();
```

The completed runtime exposes:

- `agent`: a read-only metadata and entrypoint view;
- `entrypoints.add/list/snapshot`: the only public mutation boundary;
- `manifest.build/invalidate`: protocol-neutral, origin-keyed discovery;
- `close()`: idempotent reverse-order extension disposal;
- exact slices contributed by installed extensions.

Do not restore legacy `createAgentApp`, HTTP handlers, payments helpers, or
protocol-specific placeholder properties in core.

## Extension kernel invariants

An extension returns the complete runtime slice its consumers need. Core must
attach that slice directly without wrappers or translated copies.

```ts
import type { Extension } from '@lucid-agents/types/core';

type CacheRuntime = { get(key: string): Promise<unknown> };

export function cache(): Extension<{ cache: CacheRuntime }> {
  let runtime: CacheRuntime | undefined;
  return {
    name: 'cache',
    async build() {
      runtime = await connectCache();
      return { cache: runtime };
    },
    async dispose() {
      await closeCache(runtime);
    },
  };
}
```

The builder must preserve these guarantees:

1. Extension names and runtime keys are unique.
2. `requires`, `before`, and `after` form a valid stable topological order.
3. Each successfully entered build participates in rollback, including the
   extension whose build later throws.
4. Builder and dynamic entrypoints enter one registry and run every extension's
   `onEntrypointAdded` hook.
5. Initialization and disposal are deterministic; disposal is reverse ordered.
6. A failed build or initialization leaves no live extension resources.
7. The public `runtime.agent` view has no registry mutators.

Use `initialize` only for work requiring the completed runtime. Use
`onManifestBuild` for discovery contributions and keep domain-specific manifest
logic in the owning extension.

## Entrypoints and typing

Entrypoint definitions and handler context live in `@lucid-agents/types/core`.
Input and output schemas are optional Zod-compatible schemas. The registry must
reject duplicate keys rather than replace existing handlers.

Core owns no transport behavior. HTTP input errors, SSE envelopes, request
metadata, idempotency, and authorization belong to `@lucid-agents/http` or its
domain extensions. A core change must not import `@lucid-agents/a2a`, payment
libraries, Hono, Express, or Node-only persistence.

`buildAgentManifest()` creates the protocol-neutral discovery base. Extensions
may add A2A, payments, identity, MPP, or AP2 fields through manifest hooks. Keep
the dependency direction outward: protocol packages may consume core; core must
not consume them.

## Source map

```text
src/runtime.ts             createAgent() entrypoint
src/extensions/builder.ts extension ordering, build, rollback, lifecycle
src/core/agent.ts          private registry controller + read-only public view
src/manifest.ts            protocol-neutral manifest assembly
src/validation.ts          metadata and runtime validation
src/__tests__/             kernel, typing, runtime, and lifecycle contracts
```

Shared concepts used across packages belong in `@lucid-agents/types/core`.
Avoid duplicate internal/public types, re-exports from unrelated packages,
casts that hide missing public methods, and wrappers around matching runtimes.

## Verification

From this package:

```bash
bunx tsc --noEmit
bun test
bun run build
```

For public SDK changes, also run the repository build, portability check, and
example smoke tests. Add a focused regression test for every lifecycle,
registry, manifest, or extension-ordering change.
