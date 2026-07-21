![Lucid Agents](./info.jpeg)

<div align="center">
  <h1>Lucid Agents</h1>
  <p><strong>A TypeScript application runtime for machine commerce.</strong></p>
</div>

<div align="center">
  <a href="https://github.com/daydreamsai/lucid-agents/blob/master/LICENSE"><img src="https://img.shields.io/github/license/daydreamsai/lucid-agents?style=for-the-badge" alt="License"></a>
  <a href="https://www.npmjs.com/package/@lucid-agents/cli"><img src="https://img.shields.io/npm/v/@lucid-agents/cli?style=for-the-badge" alt="NPM Version"></a>
  <a href="https://github.com/daydreamsai/lucid-agents/actions"><img src="https://img.shields.io/github/actions/workflow/status/daydreamsai/lucid-agents/ci.yml?branch=master&style=for-the-badge" alt="CI Status"></a>
</div>

Lucid turns a typed function into a discoverable service that applications and
agents can call and pay for. It composes schema validation, payment admission,
policy, idempotency, fulfillment, tasks, discovery, and durable accounting
around the Stable x402 path or the qualified Next MPP subset. Wallets,
facilitators, networks, and payment protocols stay external; Lucid owns the
application transaction that connects them to your code.

Use Lucid when you need more than a route-level paywall: several typed
capabilities, buyer or seller policy, safe retries, streaming or long-running
work, framework portability, or one contract projected into discovery and a
service storefront. For a single route with no application-runtime needs, the
official x402 SDK may be the smaller dependency.

> **Release channels:** public npm packages are the Stable channel. This
> repository is the Next channel and is currently ahead of npm. Do not mix
> package versions from the two channels. See the
> [release table](https://docs.daydreams.systems/docs/reference/release-channels)
> before copying repository examples into an npm-installed project.

## Quick start

Requirements: Bun 1.3 or Node.js 20.9+.

```bash
bunx @lucid-agents/cli@2.5.0 my-agent --adapter=hono
cd my-agent
bun install
bun run dev
```

This creates the Stable scaffold. To complete an unpaid `402` challenge and a
paid Base Sepolia response, follow the tested
[Sell a paid API](https://docs.daydreams.systems/docs/start/sell-paid-api)
tutorial. Start from the
[budgeted buyer](https://docs.daydreams.systems/docs/start/budgeted-buyer) or
[existing application](https://docs.daydreams.systems/docs/start/existing-app)
guide when that is your primary job.

The CLI can generate Hono, Express, TanStack UI/headless, and Next.js projects:

```bash
bunx @lucid-agents/cli@2.5.0 my-agent \
  --adapter=hono \
  --template=blank \
  --non-interactive
```

For the default empty API base path:

```bash
curl http://localhost:3000/.well-known/agent-card.json
curl http://localhost:3000/entrypoints
curl -X POST http://localhost:3000/entrypoints/echo/invoke \
  -H 'Content-Type: application/json' \
  -d '{"input":{"text":"Hello"}}'
```

## Build against the Next runtime

The rest of this README describes the current repository surface. Clone and
build the workspace as one compatible set before using it:

```bash
git clone https://github.com/daydreamsai/lucid-agents.git
cd lucid-agents
bun install --frozen-lockfile
bun run build:packages
```

```ts
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { z } from 'zod';

const agent = await createAgent({
  name: 'greeter',
  version: '1.0.0',
  description: 'A typed greeting service',
})
  .use(http())
  .addEntrypoint({
    key: 'greet',
    input: z.object({ name: z.string().min(1) }),
    output: z.object({ message: z.string() }),
    handler: async ({ input }) => ({
      output: { message: `Hello, ${input.name}` },
    }),
  })
  .build();

const { app } = await createAgentApp(agent);

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
};
```

Input and output are validated with Zod. The same canonical entrypoint registry
drives invocation, streaming, tasks, discovery, and every adapter.

## Architecture at a glance

```text
createAgent(meta)
    ↓ typed extension DAG
AgentRuntime + exact installed capabilities
    ↓
http() → Fetch handlers + canonical route plan + one authorization gate
    ↓
Hono | Express | TanStack Start | generated Next.js routes
```

The extension kernel validates dependencies, orders lifecycle hooks, rolls back
partial builds, and disposes resources in reverse dependency order. Domain
packages return complete runtime slices directly—core does not wrap payment,
identity, A2A, analytics, or scheduler runtimes.

The HTTP extension owns one authorization transaction for invoke, stream, and
task creation. It selects one payment rail, verifies credentials through the
owning extension, enforces sender policies and atomic limits, executes work, and
then settles/commits or releases reservations.

See [the architecture guide](docs/ARCHITECTURE.md) for extension ordering, route
contracts, payment boundaries, task ownership, portability, and test invariants.

## Core concepts

### Extensions

Each extension adds an exact runtime capability:

```ts
const agent = await createAgent(meta)
  .use(wallets({ config: walletsFromEnv() }))
  .use(payments({ config: paymentsFromEnv() }))
  .use(a2a())
  .use(analytics())
  .use(http({ basePath: '/api/agent' }))
  .build();

await agent.analytics.getSummary();
await agent.close();
```

Required capabilities are checked by TypeScript and again at runtime. For
example, `analytics()` requires an enabled payments runtime and `scheduler()`
requires A2A.

### Entrypoints

An entrypoint declares schemas, handlers, streaming behavior, optional payment
metadata, and optional SIWX policy. It can be added on the builder or later via
`agent.entrypoints.add()`. Duplicate keys are rejected and dynamic additions
invalidate the manifest cache.

### Discovery

The origin-aware agent card is served at:

- `/.well-known/agent-card.json` (canonical)
- `/.well-known/agent.json` (legacy compatibility)

It includes the current entrypoint record and extension contributions such as
payment methods, Lucid task capability metadata, AP2 v0.1 role metadata, and
draft ERC-8004 trust registrations.

### Payments

`@lucid-agents/payments` accepts the documented x402 v2 HTTP `exact` subset on
EVM and Solana seller networks and supplies an EVM x402-aware Fetch client for
outgoing calls. `@lucid-agents/mpp` uses the Payment-Auth format from the active
individual Internet-Draft, with native mppx Tempo/Stripe verification or an
explicit verifier for custom methods. When both are installed, each priced
entrypoint explicitly chooses `x402` or `mpp`.

Payment policies support per-request amounts, atomic time-window/lifetime totals,
rate limits, endpoint/peer scopes, and allow/deny lists for both outgoing and
incoming traffic. The portable storage default is in-memory; SQLite, Postgres,
and Stripe integrations are explicit subpath imports.

### Agent Card discovery and Lucid tasks

`a2a()` adds Agent Card-shaped discovery, Lucid HTTP clients, and bounded
asynchronous tasks. It is not an official A2A v1 binding and does not claim TCK
conformance. Task creation returns
`{ taskId, accessToken }`; the token is required for reads, lists, cancellation,
and SSE subscriptions, while only its hash is stored. Inject a durable
`TaskStore` for restart survival or multiple processes.

### Identity

`identity()` owns draft ERC-8004 lookup/registration, trust metadata, and OASF output.
Registration fails closed if it needs a wallet but no wallet capability exists.
The resolved result is exposed as `agent.identity.result`.

## Packages

| Package                                                   | Responsibility                                 |
| --------------------------------------------------------- | ---------------------------------------------- |
| `@lucid-agents/types`                                     | Canonical shared contracts by protocol subpath |
| [`@lucid-agents/core`](packages/core/README.md)           | Typed extension kernel and entrypoint registry |
| [`@lucid-agents/http`](packages/http/README.md)           | Fetch handlers, routes, SSE, and authorization |
| [`@lucid-agents/payments`](packages/payments/README.md)   | x402, SIWX, policies, tracking, storage ports  |
| [`@lucid-agents/mpp`](packages/mpp/README.md)             | MPP-draft subset and credential verification   |
| [`@lucid-agents/a2a`](packages/a2a/README.md)             | Agent Card-shaped metadata and Lucid task APIs |
| `@lucid-agents/wallet`                                    | Agent/developer wallet connectors              |
| [`@lucid-agents/identity`](packages/identity/README.md)   | Draft ERC-8004 identity, trust, and OASF       |
| [`@lucid-agents/ap2`](packages/ap2/README.md)             | AP2 v0.1 role metadata only                    |
| `@lucid-agents/analytics`                                 | Bound payment analytics and CSV/JSON export    |
| [`@lucid-agents/scheduler`](packages/scheduler/README.md) | Leased scheduled Lucid HTTP-profile calls      |
| [`@lucid-agents/catalog`](packages/catalog/README.md)     | YAML/CSV catalogue entrypoint generation       |
| `@lucid-agents/hono`                                      | Hono adapter over the canonical route plan     |
| `@lucid-agents/express`                                   | Express/Web Request bridge and route adapter   |
| `@lucid-agents/tanstack`                                  | TanStack Start handler adapter                 |
| [`@lucid-agents/api-sdk`](packages/api-sdk/README.md)     | Hosted Runtime API client; separate lifecycle  |
| [`@lucid-agents/cli`](packages/cli/README.md)             | Project and template generator                 |
| [`@lucid-agents/deploy`](packages/deploy/README.md)       | Guarded provider deployment executable         |

## Monetized agent example

```ts
import { analytics } from '@lucid-agents/analytics';
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';

const paymentConfig = paymentsFromEnv();
if (!paymentConfig) throw new Error('Payment environment is incomplete');

const merchant = await createAgent({ name: 'quotes', version: '1.0.0' })
  .use(
    payments({
      config: {
        ...paymentConfig,
        storage: { type: 'in-memory' },
        policyGroups: [
          {
            name: 'receivables',
            incomingLimits: {
              global: { maxPaymentUsd: 1, maxTotalUsd: 1_000 },
            },
            rateLimits: { maxPayments: 100, windowMs: 60_000 },
          },
        ],
      },
    })
  )
  .use(analytics())
  .use(http())
  .addEntrypoint({
    key: 'market-quote',
    price: '0.01',
    paymentProtocol: 'x402',
    handler: async ({ input }) => ({ output: { input, price: 42 } }),
  })
  .build();

const summary = await merchant.analytics.getSummary(86_400_000);
const csv = await merchant.analytics.exportCSV();
```

For SQLite or Postgres, import and inject the matching factory from
`@lucid-agents/payments/storage/sqlite` or `/storage/postgres`.

## Development

```bash
bun install
bun run build:packages
bun run type-check
bun run lint
bun run format:check
bun run test:portability
bun run test:coverage
bun test packages/examples/src/__tests__/
```

The build script discovers all workspace packages and derives a topological
order from package manifests. CI additionally imports portable package roots on
Node 20 and 22, performs an edge-like dependency check, and runs Postgres
integration tests. Coverage is measured from TypeScript sources (compiled
`dist/` artifacts and tests are excluded); `scripts/check-coverage.ts` enforces
aggregate minimums of 90% lines and 90% functions.

New SDK surface requires unit/integration coverage, an examples smoke test,
documentation, and a changeset. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Resources

- [Documentation](https://docs.daydreams.systems/)
- [When to use Lucid](https://docs.daydreams.systems/docs/start/when-to-use-lucid)
- [Protocol compatibility](https://docs.daydreams.systems/docs/protocols)
- [Architecture guide](docs/ARCHITECTURE.md)
- [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004)
- [x402](https://github.com/paywithx402)
- [A2A Protocol](https://a2a-protocol.org/)
- [Bun](https://bun.sh/docs)

## License

MIT. See [LICENSE](LICENSE).
