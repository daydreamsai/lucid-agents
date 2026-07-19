# Lucid Agents architecture

This document describes the current package boundaries and runtime invariants. It
is intended to be a map for maintainers, not a catalogue of every public API.

## Design rules

1. `@lucid-agents/types` owns shared protocol contracts and contains no runtime
   implementation.
2. `@lucid-agents/core` owns the extension kernel, the entrypoint registry, and
   runtime lifecycle. It does not own HTTP routing or payment enforcement.
3. An extension owns its domain runtime. Core installs the returned slice
   directly; it does not wrap or translate it.
4. `@lucid-agents/http` owns the transport-neutral Fetch handlers, route plan,
   and the single authorization gate used by invoke, stream, and task requests.
5. Adapters translate the canonical route plan into framework routes. They do
   not implement a second paywall or entrypoint registry.
6. Process-local state is the portable default. Node-only and durable backends
   live behind explicit package subpaths or injected ports.
7. A task is an owned capability. Its opaque access token is returned once and
   only a SHA-256 hash is persisted.

## Package map

```text
types                         shared contracts
  │
  ├─ core                    extension kernel + protocol-neutral manifest base
  │
  ├─ extensions
  │    ├─ http               Fetch handlers + canonical route plan + auth gate
  │    ├─ payments           x402, SIWX, policies, tracking, storage ports
  │    ├─ mpp                MPP challenges and credential verification
  │    ├─ wallet             wallet connectors
  │    ├─ identity           ERC-8004 identity and OASF contribution
  │    ├─ a2a                cards, clients, bounded/durable task runtime
  │    ├─ ap2                AP2 manifest capability
  │    ├─ analytics          operations bound to the payments tracker
  │    ├─ scheduler          leased, idempotent A2A jobs
  │    └─ catalog            catalogue-driven entrypoint registration
  │
  ├─ adapters
  │    ├─ hono
  │    ├─ express
  │    └─ tanstack
  │
  ├─ api-sdk                 generated Runtime API client
  └─ cli                     project/template generator (no runtime dependency)
```

Package build order is not hand-maintained. `scripts/build-packages.ts` reads
workspace manifests, topologically orders production/optional/peer dependencies,
and rejects dependency cycles. This prevents a new package from silently being
omitted from releases.

## Extension kernel

`createAgent(meta)` returns a typed `AgentBuilder`. Each `.use(extension)` call
adds the extension's runtime slice to the builder type. Required capabilities
are also tracked in the type, so `.build()` is unavailable when a required
extension is absent.

At runtime, the kernel performs these steps:

```text
validate unique extension names
        ↓
topologically order requires / before / after constraints
        ↓
build each extension sequentially and attach its slice directly
        ↓
register entrypoints in one AgentCore registry
        ↓
run initialize hooks sequentially
        ↓
return AgentRuntime
```

Extension property collisions, missing required extensions, dependency cycles,
duplicate entrypoint keys, invalid slices, and lifecycle hook failures are hard
errors. If build or initialization fails, every extension whose build was
entered, including the currently failing extension, is disposed in reverse
dependency order. `runtime.close()` is idempotent and uses the same reverse
order.

An extension contract has:

- `name` and optional `requires`, `before`, and `after` constraints;
- `build(context)` to return its complete runtime slice;
- `onEntrypointAdded` for validation or activation;
- `initialize` for setup that needs the completed runtime;
- `onManifestBuild` to contribute discovery metadata;
- `dispose` to release resources.

## Canonical runtime and entrypoints

The base `AgentRuntime` contains only protocol-neutral capabilities:

- `agent`: a read-only metadata and entrypoint view;
- `entrypoints.add/list/snapshot`: the one public entrypoint registry;
- `manifest.build/invalidate`: origin-keyed agent-card generation;
- `close`: lifecycle cleanup.

Extensions add named capabilities such as `runtime.http`, `runtime.payments`, or
`runtime.a2a`. No fixed HTTP, payments, identity, or wallet keys are present in
the base runtime type.

All entrypoints—whether added on the builder or dynamically on the completed
runtime—enter the same registry. Every consumer reads a snapshot of that
registry, eliminating adapter-specific copies and stale manifests.

## HTTP route contract

The HTTP extension contributes:

```ts
runtime.http = {
  basePath,
  handlers,
  routes,
};
```

`routes` is the canonical framework-neutral route plan. Hono and Express bind it
directly. TanStack and generated Next/TanStack projects delegate route modules to
the same `handlers`. A configured `basePath` applies consistently to health,
discovery, entrypoint, and task routes.

The route plan contains:

| Capability                   | Method and path                                    |
| ---------------------------- | -------------------------------------------------- |
| Health                       | `GET {basePath}/health`                            |
| Entrypoints                  | `GET {basePath}/entrypoints`                       |
| Invoke                       | `POST {basePath}/entrypoints/:key/invoke`          |
| Stream                       | `POST {basePath}/entrypoints/:key/stream`          |
| Agent card                   | `GET {basePath}/.well-known/agent-card.json`       |
| Legacy card alias            | `GET {basePath}/.well-known/agent.json`            |
| OASF                         | `GET {basePath}/.well-known/oasf-record.json`      |
| Tasks, when A2A is installed | `POST/GET {basePath}/tasks` and task member routes |

The agent-card compatibility routes generated at a framework root call the
runtime manifest handler; they never keep a second manifest cache.

Invoke idempotency is target-side and enabled by default. The HTTP runtime binds
a 20–256 character `Idempotency-Key` to an entrypoint, request fingerprint,
ambient authorization/cookie context, and a stable subject derived from a
freshly verified SIWX or payment credential. Only completed 2xx responses are
retained and replayed for the same subject. Claims are owner-fenced, bounded,
and expiring; multi-instance deployments inject an atomic durable
`HttpIdempotencyStore`. Policy admission and settlement occur only after a new
claim is won, so a retry is not blocked by its own committed limits or settled
twice.

## One authorization transaction

Invoke, stream, and task creation call the same
`authorizeEntrypointRequest(request, entrypoint, operation)` gate.

```text
request + canonical entrypoint
        ↓
validate exactly one configured payment rail
        ↓
SIWX entitlement/auth-only verification
        ↓
x402 or MPP challenge / credential verification
        ↓
invoke idempotency claim or authenticated replay
        ↓
verified incoming policy evaluation
        ↓
atomic total/rate reservations
        ↓
execute invoke, or admit stream/task work
        ↓
stage non-expiring policy accounting
        ↓
finalize(response): settle + commit, or release on settlement failure
```

Important invariants:

- A priced entrypoint cannot ambiguously use both x402 and MPP. The entrypoint
  must select a rail when both extensions are installed.
- An arbitrary payment header is not authorization. The owning payment package
  must verify the credential.
- MPP uses the standard `WWW-Authenticate: Payment` challenge and
  `Authorization: Payment` credential wire contract. Native Tempo/Stripe rails
  delegate verification to mppx; custom rails require an explicit verifier.
- Credential verification and policy admission are separate phases. A
  completed invoke replay is freshly authenticated but never reserves policy
  state, executes application code, or invokes Lucid settlement again.
- SIWX entitlement reuse is evaluated before either payment rail, including
  MPP. An MPP verifier that performs external settlement must use the request's
  idempotency key as its own deduplication boundary.
- Static amount and endpoint limits may be preflighted, but incoming sender
  rules run only with a cryptographically verified x402 or MPP payer. HTTP
  `Origin` and `Referer` are never sender identity.
- Total and rate limits reserve capacity atomically in the configured storage.
  Storage errors fail closed; a request cannot bypass a limit because tracking
  is unavailable.
- Before an irreversible settlement, every reservation and non-reserved history
  record moves atomically into a durable, non-expiring staged batch. Successful
  settlement commits that batch through one storage transaction; a later
  accounting error leaves it counted until reconciliation.
- Invoke commits only after successful application output. Streams and tasks
  commit when the server successfully admits the asynchronous work because the
  HTTP response is already live/accepted at that boundary.
- Invalid input, failed invoke output/handlers, failed admission, or failed
  settlement releases outstanding or staged capacity. Recording errors after a
  successful settlement retain the staged batch and therefore fail closed.
- Outgoing policy wrapping is active even when no rate limiter is configured.

## Payment boundaries

`@lucid-agents/payments` owns x402 verification/settlement, incoming and outgoing
policies, payment tracking, SIWX, and payment-aware Fetch construction. Adapters
only invoke the authorization contract exposed through HTTP.

The portable default is isolated in-memory payment and SIWX storage. Durable or
platform-specific code must be selected explicitly:

| Import                                    | Purpose                              | Platform        |
| ----------------------------------------- | ------------------------------------ | --------------- |
| `@lucid-agents/payments`                  | portable runtime + in-memory storage | Web/Node/Bun    |
| `@lucid-agents/payments/node`             | environment-driven Node factories    | Node/Bun        |
| `@lucid-agents/payments/storage/sqlite`   | SQLite factories                     | Bun/Node server |
| `@lucid-agents/payments/storage/postgres` | Postgres factories                   | Node/Bun server |
| `@lucid-agents/payments/providers/stripe` | Stripe PAYTO resolution              | Node/Bun server |

Postgres and Stripe are optional peer dependencies. The portable root import
must not statically load `bun:sqlite`, `pg`, Stripe, or Node-only globals.

## A2A task ownership and durability

Task endpoints exist only when `a2a()` is installed. Creating a task returns:

```ts
{ taskId, accessToken, status: 'running' }
```

Subsequent get, list, cancel, and subscribe operations require the access token
through the `Task-Access-Token` header. A token is 20–256 characters; the store
receives only its SHA-256 hash. Unknown tasks and tasks owned by another token
are intentionally indistinguishable.

`TaskStore` is an injectable persistence port with atomic execution claims,
fenced `compareAndSet` state transitions, and subscription delivery. A worker
claims a running task with an expiring owner lease before executing it. Another
worker may recover an expired lease, while the stale owner is prevented from
publishing a terminal result. Worker shutdown aborts local handlers but leaves
durable running records recoverable rather than cancelling them. The default
`createInMemoryTaskStore()`:

- bounds the number of retained tasks;
- expires terminal tasks after a retention window;
- evicts only terminal tasks and rejects capacity exhaustion otherwise;
- isolates subscriptions by owner hash;
- supports a bounded execution timeout.

Production deployments that need restart survival must inject a durable store.
Agent cards only advertise task capabilities when the A2A task runtime exists.

## Scheduler guarantees

The scheduler requires `a2a()` and optionally uses `payments()` for paid calls.
Jobs are claimed with leases through an injected `SchedulerStore`. Each job gets
an idempotency key automatically. Retries reuse that key, while a successful
interval occurrence rotates the scheduler-managed key for the next occurrence.
This gives downstream agents a stable deduplication key for at-least-once worker
execution.

## Identity and discovery ownership

The identity extension owns ERC-8004 initialization, registration results, trust
metadata, and OASF contribution. It fails closed when registration needs a wallet
and no wallet capability is present. The resolved `AgentIdentity` is exposed as
`runtime.identity.result`; generated applications do not run a second identity
initialization path.

Manifest building is origin-aware and extension-driven. HTTP serves the current
manifest directly, so dynamic entrypoints and extension contributions appear in
all adapters without a separate adapter cache.

## Portability and test matrix

The repository verifies architecture at several levels:

- strict TypeScript for every package;
- dependency-derived full package builds;
- Node 20 and Node 22 portable import checks;
- an edge-like import scan that rejects Node/Bun-only dependencies in every
  portable public entrypoint while validating and excluding explicitly
  declared Node-only or bundler-only subpaths;
- adapter contract tests for route parity and base paths;
- authorization tests across invoke, stream, and tasks;
- concurrent storage tests for atomic policy limits;
- durable task-store contract and ownership tests;
- generated-template and example smoke tests;
- PostgreSQL integration tests in CI;
- repository-wide executable package-source line and function coverage
  thresholds in CI. Type-only barrels, generated clients, templates, and the
  separately smoke-tested examples package are excluded. Compiled
  `dist/` artifacts and test files are excluded from the coverage denominator;
  the aggregate gate is implemented by `scripts/check-coverage.ts` rather than
  Bun's per-file threshold setting.

Run the same local quality sequence with:

```bash
bun run build:packages
bun run type-check
bun run deadcode
bun run lint
bun run format:check
bun run test:portability
bun run test:coverage
bun test packages/examples/src/__tests__/
```

## Adding a capability

1. Put shared contracts in the owning package or `@lucid-agents/types` when
   multiple packages genuinely share them.
2. Return the complete domain runtime from an extension; do not add a wrapper in
   core.
3. Declare runtime requirements in both the typed dependency shape and
   `requires`/ordering metadata.
4. If the capability adds HTTP surface, extend the HTTP handler and canonical
   route contracts, then prove parity in every adapter/template.
5. If it stores state, define an atomic persistence port, a bounded portable
   default, and a durable contract test.
6. Add unit, integration, portability, generated-project, and example smoke
   coverage proportional to the public surface.
7. Update package docs, this architecture map, and add a changeset.
