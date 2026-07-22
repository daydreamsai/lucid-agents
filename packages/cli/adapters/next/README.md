# Next.js adapter template

The CLI copies this base layer when scaffolding a full-stack Next.js agent. It
contains:

- App Router API modules under `/api/agent`;
- root A2A/OASF discovery aliases under `/.well-known`;
- a minimal endpoint directory derived from public discovery and health data.

## One runtime contract

The generated `lib/agent.ts` exports the completed Lucid runtime and its
`runtime.http.handlers`. Every API route delegates to those handlers. There is
no Next-specific paywall or duplicate manifest cache: x402, MPP, SIWX, incoming
policies, settlement, and task authorization all run in the shared HTTP gate.

The runtime is mounted at `/api/agent`. These root compatibility routes call the
same manifest/OASF handlers with the incoming request origin:

- `/.well-known/agent-card.json`
- `/.well-known/agent.json`
- `/.well-known/oasf-record.json`

Task modules under `/api/agent/tasks` are usable when the generated agent
installs `a2a()`.

Configure the generated app's server environment, for example:

```bash
PAYMENTS_RECEIVABLE_ADDRESS=0x...
NETWORK=base-sepolia
FACILITATOR_URL=https://facilitator.example
```

Then run:

```bash
bun install
bun run dev
```

## Important files

- `lib/agent.ts` — generated agent, runtime, and entrypoints
- `app/api/agent/*` — thin route modules over HTTP handlers
- `app/.well-known/*` — root discovery compatibility routes
- `components/service-storefront.tsx` — read-only endpoint table using the
  manifest's entrypoint record and per-operation pricing
