![Lucid Agents machine commerce runtime infographic](./lucid-agents-infographic.webp)

<div align="center">
  <h1>Lucid Agents</h1>
  <p><strong>A TypeScript runtime for machine commerce.</strong></p>
</div>

<div align="center">
  <a href="https://github.com/daydreamsai/lucid-agents/blob/master/LICENSE"><img src="https://img.shields.io/github/license/daydreamsai/lucid-agents?style=flat-square" alt="License"></a>
  <a href="https://www.npmjs.com/package/@lucid-agents/cli"><img src="https://img.shields.io/npm/v/@lucid-agents/cli?style=flat-square" alt="npm version"></a>
  <a href="https://github.com/daydreamsai/lucid-agents/actions"><img src="https://img.shields.io/github/actions/workflow/status/daydreamsai/lucid-agents/ci.yml?branch=master&style=flat-square" alt="CI status"></a>
</div>

Lucid turns typed functions into discoverable services that agents and
applications can call, pay for, stream, or run as tasks. It provides one
runtime for schemas, payment admission, policy, idempotency, fulfillment,
discovery, and accounting while wallets, payment protocols, networks, and
facilitators remain external.

Use Lucid when a service needs several typed capabilities or shared behavior
across frameworks. For a single paid route, the upstream payment middleware may
be the smaller dependency.

## Start with your coding agent

The primary way to work with Lucid is through a coding agent that understands
the runtime, packages, release channels, and adapter boundaries. Run this from
your project root before giving the agent its first Lucid task:

```bash
curl -fsSL https://docs.daydreams.systems/skills/lucid-agents/install.sh | sh
```

Reload your agent, ask it to use the `lucid-agents` skill, and let it inspect the
project before editing. The installer verifies the versioned skill archive and
does not install npm packages or modify application source; see the
[skill installation guide](https://docs.daydreams.systems/docs/start/agent-skill)
for the manual checksum flow and removal instructions.

## Quick start

Requires Bun 1.3+. Runtime packages also support Node.js 20.9+.

```bash
bunx @lucid-agents/cli@2.5.0 my-agent --adapter=hono --template=blank
cd my-agent
bun install
bun run dev
```

The generated service exposes health, discovery, and a typed `echo`
entrypoint:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/.well-known/agent-card.json
curl -X POST http://localhost:3000/entrypoints/echo/invoke \
  -H 'Content-Type: application/json' \
  -d '{"input":{"text":"Hello"}}'
```

Public npm packages are the **Stable** channel. This repository is **Next** and
can be ahead of npm. Keep all packages on one channel; see
[release channels](https://docs.daydreams.systems/docs/reference/release-channels)
for the current compatibility table.

## Core API

This example uses the current repository surface:

```ts
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { z } from 'zod';

const runtime = await createAgent({
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

const { app } = await createAgentApp(runtime);

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
};
```

The entrypoint definition is the source for validation, invocation, streaming,
tasks, discovery, and every framework adapter.

The compiled [full agent example](packages/examples/src/core/full-agent.ts) adds
payments, identity, and streaming.

## Feature matrix

Package names below use the `@lucid-agents/` prefix.

| Capability                             | Packages involved             | What they provide                                                                                                                |
| -------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Typed runtime                          | `core`, `types`               | Extension lifecycle, exact runtime types, and one entrypoint registry                                                            |
| [HTTP](packages/http/README.md)        | `http`                        | Fetch handlers, route planning, authorization, idempotency, server-sent events (SSE), and service-page data                      |
| x402 commerce                          | `payments`                    | Ethereum Virtual Machine (EVM) and Solana seller verification, EVM buying, Sign-In-With-X (SIWX), policy, and tracking           |
| Machine Payments Protocol (MPP)        | `mpp`                         | Payment-Auth challenges and Tempo, Stripe, or custom credential verification                                                     |
| Wallets                                | `wallet`                      | Agent and developer wallet connectors for signing and outgoing calls                                                             |
| Identity                               | `identity`, `wallet`          | ERC-8004 registration and lookup, trust metadata, and [Open Agentic Schema Framework (OASF)](packages/identity/README.md) output |
| Agent discovery and tasks              | `a2a`                         | Agent Card-shaped discovery, client calls, and token-protected asynchronous tasks                                                |
| Agent Payments Protocol (AP2) metadata | `ap2`                         | AP2 v0.1 role metadata in discovery                                                                                              |
| Analytics                              | `analytics`, `payments`       | Bound payment summaries and JSON/CSV exports                                                                                     |
| Scheduling                             | `scheduler`, `a2a`            | Leased, idempotent scheduled agent calls                                                                                         |
| Catalogs                               | `catalog`                     | YAML/CSV-defined entrypoints                                                                                                     |
| Frameworks                             | `hono`, `express`, `tanstack` | Bind the canonical HTTP contract to Hono, Express, or TanStack Start                                                             |
| Tooling                                | `cli`, `deploy`               | Project generation and guarded provider deployment                                                                               |
| Hosted client                          | `api-sdk`                     | Generated client for the separately operated hosted Runtime API                                                                  |

The CLI generates Hono, Express, TanStack UI/headless, and Next.js projects.
Next.js uses generated App Router modules rather than a standalone adapter
package. See the [package reference](https://docs.daydreams.systems/docs/packages)
for open-source exports, configuration, and runtime support. The `api-sdk` has a
[separate lifecycle](https://docs.daydreams.systems/docs/products/hosted-platform).

Protocol names in the matrix describe Lucid's implemented subset, not blanket
conformance. See [protocol compatibility](https://docs.daydreams.systems/docs/protocols)
for versions, bindings, and exclusions.

## Runtime model

```text
typed entrypoint
      ↓
core registry + domain extensions
      ↓
one HTTP authorization and route contract
      ↓
Hono | Express | TanStack Start | generated Next.js routes
```

The package boundaries are deliberate:

- `types` owns shared contracts; each domain package owns its runtime behavior.
- Core exposes extension slices directly without wrappers or duplicate state.
- Adapters bind the HTTP route plan; they do not add another paywall or registry.
- In-memory state is the portable default; durable backends are explicit.

Read [the architecture guide](docs/ARCHITECTURE.md) for extension ordering,
authorization, task ownership, deployment boundaries, and portability.

## Guides

| Goal                        | Guide                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| Decide whether Lucid fits   | [When to use Lucid](https://docs.daydreams.systems/docs/start/when-to-use-lucid)         |
| Build a paid service        | [Sell a paid API](https://docs.daydreams.systems/docs/start/sell-paid-api)               |
| Build a controlled buyer    | [Budgeted buyer](https://docs.daydreams.systems/docs/start/budgeted-buyer)               |
| Add Lucid to an application | [Existing app](https://docs.daydreams.systems/docs/start/existing-app)                   |
| Prepare for production      | [Production checklist](https://docs.daydreams.systems/docs/operate/production-checklist) |
| Browse tested examples      | [Examples](packages/examples/README.md)                                                  |

## Contributing

```bash
bun install --frozen-lockfile
bun run build:packages
bun run type-check
bun run lint
bun run test:coverage
```

Keep changes within the package that owns the behavior. Changes that add or
modify SDK surface need unit or integration coverage, a matching examples smoke
test, updates to the relevant `AGENTS.md` and package README, public API JSDoc,
and a changeset. Shared concepts belong in `@lucid-agents/types`; do not
duplicate or re-export them through another package. Run `bun run test:docs`
when changing public examples, package references, or documentation navigation.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow, testing
commands, pull-request checklist, and release process.

## License

[MIT](LICENSE)
