# @lucid-agents/hono

Hono adapter for a completed Lucid HTTP runtime.

```ts
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';

const runtime = await createAgent({ name: 'agent', version: '1.0.0' })
  .use(http({ basePath: '/api/agent' }))
  .build();

const { app, addEntrypoint } = await createAgentApp(runtime, {
  beforeMount(app) {
    app.use('*', async (context, next) => {
      context.header('X-Service', 'agent');
      await next();
    });
  },
});
```

The adapter binds `runtime.http.routes` directly. It has no payment, SIWX, task,
manifest, or entrypoint registry of its own. Every configured base path and
authorization rule therefore matches the Express and TanStack adapters.

`addEntrypoint(def)` delegates to `runtime.entrypoints.add(def)` and invalidates
the manifest through the canonical registry. Use `beforeMount` for middleware
that must wrap agent routes and `afterMount` for additional routes or error
handlers.

Always build with `http()` before creating the app. Close the runtime during
server shutdown with `await runtime.close()`.
