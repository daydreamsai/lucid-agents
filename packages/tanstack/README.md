# @lucid-agents/tanstack

TanStack Start handler adapter for a completed Lucid HTTP runtime.

```ts
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { createTanStackRuntime } from '@lucid-agents/tanstack';

const agent = await createAgent({ name: 'agent', version: '1.0.0' })
  .use(http({ basePath: '/api/agent' }))
  .build();

export const { runtime, handlers, routes } = await createTanStackRuntime(agent);
```

Generated TanStack route modules call the returned handlers:

```ts
export const POST = ({ request, params }: RouteContext) =>
  handlers.invoke({ request, params: { key: params.key } });
```

The wrapper delegates to the completed `runtime.http.handlers`, including invoke
and stream. It does not call a lower-level execution path or install an
adapter-local paywall. `routes` exposes the same canonical route plan used by
Hono and Express for inspection and tooling.

The CLI supplies both UI and headless TanStack Start shells. Their generated
root discovery routes delegate to the runtime manifest/OASF handlers, and task
routes are available only when `a2a()` is installed.
