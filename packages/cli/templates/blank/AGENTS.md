# Blank agent template guide

This generated project composes a protocol-neutral agent runtime with the HTTP
extension and optional x402 payments. The selected adapter only mounts the
completed HTTP runtime; it does not own a second registry or paywall.

## Runtime composition

The generated agent follows this shape:

```ts
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';

const agent = await createAgent({
  name: process.env.AGENT_NAME ?? 'my-agent',
  version: process.env.AGENT_VERSION ?? '0.1.0',
  description: process.env.AGENT_DESCRIPTION,
})
  .use(payments({ config: paymentsFromEnv() }))
  .use(http({ basePath: '/api/agent' })) // generated only when the adapter needs it
  .build();
```

`paymentsFromEnv()` returns `undefined` when payment configuration is absent,
so a free generated agent can boot without payment variables. A priced
entrypoint activates payments and fails closed unless the required destination,
network, and facilitator configuration is complete.

Register entrypoints through the adapter's returned `addEntrypoint` helper or
`runtime.entrypoints.add`. Both write to the same canonical registry:

```ts
addEntrypoint({
  key: 'echo',
  input: z.object({ text: z.string().min(1) }),
  output: z.object({ text: z.string() }),
  handler: async ({ input }) => ({ output: { text: input.text } }),
});
```

Add `price: '0.01'` for x402. Add a `stream` handler to support SSE; there is no
separate streaming flag.

## Adapter shapes

- Hono and Express call `createAgentApp(agent)` and bind
  `agent.http.routes`.
- TanStack calls `createTanStackRuntime(agent)` and exports its handlers.
- Next exports `agent.http.handlers` through route modules.
- TanStack and Next use `/api/agent` as the HTTP base path; Hono and Express use
  the root unless changed in `http({ basePath })`.

Every route, including discovery and tasks, uses the configured base path. The
canonical card is `/.well-known/agent-card.json` below that path. Generated
framework-root compatibility routes delegate to the same manifest handler.

## Payment environment

Static x402 receiving uses:

```dotenv
PAYMENTS_RECEIVABLE_ADDRESS=0x...
PAYMENTS_FACILITATOR_URL=https://facilitator.example
PAYMENTS_NETWORK=eip155:84532
```

Supported aliases include `ethereum`, `sepolia`, `base`, `base-sepolia`,
`solana`, and `solana-devnet`; they normalize to canonical CAIP-2 identifiers.
Stripe destination mode additionally requires `PAYMENTS_DESTINATION=stripe`
and `STRIPE_SECRET_KEY` and is Node-only.

Never expose private keys, facilitator tokens, or Stripe secrets in client
bundles. Use the payments package's explicit Node subpaths for SQLite,
Postgres, Stripe, or config-file helpers.

## Routes

With an empty base path, HTTP exposes:

- `GET /health`
- `GET /entrypoints`
- `POST /entrypoints/:key/invoke`
- `POST /entrypoints/:key/stream`
- `GET /.well-known/agent-card.json`
- `GET /.well-known/agent.json` (legacy alias)
- `GET /.well-known/oasf-record.json`

Task routes appear only after installing `a2a()`.

Invoke supports an `Idempotency-Key` header. The default bounded in-memory store
deduplicates retries in one process. Multi-instance deployments should inject a
durable `HttpIdempotencyStore` through `http({ idempotency: { store } })`.

## Extending the generated agent

Install capabilities as extensions before `.build()`:

```ts
const agent = await createAgent(meta)
  .use(wallets({ config: walletsFromEnv() }))
  .use(payments({ config: paymentsFromEnv() }))
  .use(a2a())
  .use(http())
  .addEntrypoint(definition)
  .build();
```

Each extension owns its runtime (`agent.wallets`, `agent.payments`,
`agent.a2a`). Do not recreate payment middleware, manifests, or entrypoint maps
inside an adapter.

## Verification

```bash
bun install
bun run type-check
bun run build
bun test
```

Exercise health, agent-card discovery, invoke, and any priced or streaming route
before deployment. Call `agent.close()` during graceful shutdown when the
adapter exposes a long-lived server process.
