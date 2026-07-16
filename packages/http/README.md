# @lucid-agents/http

Fetch-native HTTP handlers, SSE helpers, a canonical route plan, and the shared
entrypoint authorization gate for Lucid Agents.

## Use as an extension

```ts
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';

const agent = await createAgent({ name: 'echo', version: '1.0.0' })
  .use(http({ basePath: '/api/agent', landingPage: true }))
  .addEntrypoint({
    key: 'echo',
    handler: async ({ input }) => ({ output: input }),
  })
  .build();

agent.http.basePath; // '/api/agent'
agent.http.handlers; // transport-neutral Fetch handlers
agent.http.routes; // canonical route/capability plan
```

Install domain extensions such as `payments()`, `mpp()`, `identity()`, and
`a2a()` before HTTP when possible. The kernel also honors HTTP's ordering
constraints if call-site order differs.

## Route plan

`agent.http.routes` is the only route definition used by the server adapters.
Each item contains a stable ID, method, path, path parameter names, and a
`handle(Request, params)` function.

With no base path, the plan includes:

- `GET /health` and `GET /entrypoints`;
- `POST /entrypoints/:key/invoke` and `/stream`;
- `GET /.well-known/agent-card.json` and the legacy `agent.json` alias;
- `GET /.well-known/oasf-record.json` and `/favicon.svg`;
- the landing route, unless disabled;
- task routes only when `a2a()` is installed.

`basePath` prefixes every capability consistently and is written into the agent
card's HTTP interface URL.

An adapter can bind the route plan without depending on its internals:

```ts
for (const route of agent.http.routes) {
  framework.route(route.method, route.path, request =>
    route.handle(request, framework.params(request))
  );
}
```

Hono and Express already do this. Generated Next and TanStack route modules call
the same handler contract.

## Authorization

Invoke, stream, and task creation all call one authorization transaction. It:

1. resolves one payment rail for the canonical entrypoint;
2. verifies SIWX, x402, or MPP credentials in the owning extension;
3. wins the target-side idempotency claim for invokes;
4. admits the request by evaluating and reserving incoming policy capacity;
5. executes an invoke or admits stream/task work;
6. finalizes settlement/recording or releases reservations on a pre-admission
   failure.

Invoke finalization follows the handler result. Streaming and task requests
finalize when their asynchronous work is successfully admitted, since their
HTTP response is already live or accepted at that point.

If both x402 and MPP are installed, every priced entrypoint must set
`paymentProtocol: 'x402' | 'mpp'`. An auth-only entrypoint requires an enabled
SIWX payments runtime. These conditions are validated when the entrypoint is
registered, including dynamic registration after build.

`authorizeEntrypointRequest` is exported for a custom transport that needs the
same gate. After successful verification, call `authorization.admit()`. Only an
admitted request may execute; call the admission's `finalize(response)` exactly
once for every admitted request, including error responses. Call `abort()` if
the transport abandons admitted work before it has a response.

## Handlers

Handlers accept standard Web `Request` objects and return `Response` objects:

```ts
const response = await agent.http.handlers.invoke(
  new Request('https://example.test/api/agent/entrypoints/echo/invoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { value: 1 } }),
  }),
  { key: 'echo' }
);
```

The manifest handler builds by request origin, so generated compatibility routes
must delegate to it rather than cache `runtime.manifest.build()` independently.

## Idempotent invoke

Target-side invoke idempotency is enabled by default. Send a stable 20–256
character `Idempotency-Key` when retrying an operation:

```ts
await fetch('https://agent.example/entrypoints/charge/invoke', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Idempotency-Key': 'charge:customer-42:invoice-2026-07',
  },
  body: JSON.stringify({ input: { amount: 10 } }),
});
```

The key is scoped to the entrypoint and bound to the request body, ambient
authorization/cookie context, and a stable identity derived from the freshly
verified SIWX or payment credential. Verification happens before the claim;
policy reservation and settlement happen only after a new claim is won. A
completed 2xx response is replayed only for the same verified subject, with
`Idempotency-Replayed: true`; a concurrent duplicate or reuse with different
input returns 409. Authorization challenges and application failures release
the claim so they can be retried. If storing a completed response fails after
execution, HTTP returns 503 and retains the active claim to prevent duplicate
execution or settlement.

The default store is bounded and process-local. Multi-instance deployments must
inject an atomic durable store:

```ts
http({
  idempotency: {
    store: durableIdempotencyStore,
    inProgressTtlMs: 15 * 60_000,
    retentionMs: 24 * 60 * 60_000,
  },
});
```

Set `idempotency: false` only when the application intentionally provides an
equivalent deduplication boundary elsewhere.

## Streaming

Streaming entrypoints use SSE envelopes. A stream handler receives an `emit`
function as its second argument and returns an optional final result:

```ts
.addEntrypoint({
  key: 'tokens',
  stream: async ({ input }, emit) => {
    await emit({ kind: 'text', text: String(input) });
    return { output: { done: true }, status: 'succeeded' };
  },
})
```

Low-level `createSSEStream` and `writeSSE` helpers are available for custom
transports. Envelope and route contracts are defined in
`@lucid-agents/types/http`.

## Low-level invocation

`invoke`, `invokeHandler`, and `stream` are exported for integration code. They
operate on the canonical runtime/entrypoint definitions and perform Zod input
and output validation. Prefer the completed HTTP runtime unless you are writing
an adapter.
