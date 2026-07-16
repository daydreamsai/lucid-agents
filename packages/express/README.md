# @lucid-agents/express

Express adapter for a completed Lucid HTTP runtime.

```ts
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/express';
import { http } from '@lucid-agents/http';

const runtime = await createAgent({ name: 'agent', version: '1.0.0' })
  .use(http({ basePath: '/api/agent' }))
  .build();

const { app } = await createAgentApp(runtime, {
  beforeMount(app) {
    app.set('trust proxy', true);
  },
});

const server = app.listen(3000);
```

The adapter translates Express requests and Node streams to standard Web
`Request`/`Response` objects, then binds `runtime.http.routes`. It does not own a
paywall or duplicate the manifest/task/entrypoint runtime. x402, MPP, SIWX, and
incoming policy behavior is identical to other adapters.

Use `beforeMount` for middleware that must run before agent routes and
`afterMount` for extra routes or error handlers. On shutdown, close both the
server and Lucid runtime.
