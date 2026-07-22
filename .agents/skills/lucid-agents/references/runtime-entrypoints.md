# Runtime and entrypoints

Build one runtime by composing domain extensions. A representative stable shape is:

```ts
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';

const runtime = await createAgent({
  name: 'weather-agent',
  version: '1.0.0',
  description: 'Returns a forecast',
})
  .use(http())
  .build();
```

Confirm the installed builder signature. Some generated adapters expose `addEntrypoint`; others use `runtime.addEntrypoint`.

```ts
addEntrypoint({
  key: 'forecast',
  description: 'Get a forecast for a city',
  input: z.object({ city: z.string().min(1) }),
  output: z.object({ summary: z.string() }),
  handler: async context => ({
    output: { summary: await forecast(context.input.city) },
    usage: { total_tokens: 0 },
  }),
});
```

Entrypoint keys must be unique. Keep schema and handler output synchronized. Return structured errors through the established runtime path; do not create an adapter-only error format.

Extension order follows declared dependencies. `http()` owns routes and the shared authorization transaction; domain extensions supply capabilities that transaction consumes. Adapters bind the canonical route plan. Avoid getters or wrappers around a complete domain runtime and never duplicate a shared contract outside `@lucid-agents/types` or its owning package.

Streaming uses the HTTP runtime's SSE contract. A2A tasks use the task state machine. Do not imitate either with an ad hoc route.
