# {{AGENT_NAME}}

Generated Lucid service with one canonical runtime and the selected Hono,
Express, TanStack Start, or Next.js adapter.

## Run

Inspect `package.json` and `.env.example` before installing. Keep the package
set on the same Stable or Next channel used by the CLI that generated it.

```bash
bun install
bun run type-check
bun run build
bun run dev
```

The adapter-specific server prints or uses its local port (normally `3000`).
Check:

```bash
curl -i http://localhost:3000/health
curl -i http://localhost:3000/.well-known/agent-card.json
curl -i http://localhost:3000/entrypoints/echo/invoke \
  -H 'content-type: application/json' \
  -H 'idempotency-key: generated-echo-request-000001' \
  --data '{"input":{"text":"hello"}}'
```

TanStack/Next generated APIs use the configured `/api/agent` base path; inspect
the generated Agent Card rather than assuming the root paths above.

## Runtime boundary

- Core owns the typed entrypoint registry.
- `@lucid-agents/http` owns request validation, canonical routes,
  authorization, idempotency, and SSE.
- The selected adapter binds that runtime; do not add another paywall,
  manifest, or entrypoint map.

The default `echo` entrypoint is free. To sell a capability, add an explicit USD
decimal `price` such as `'0.01'` and configure the complete x402 seller group in
`.env`. There is no global default-price environment variable.

## Secrets and state

The blank service does not require a private key merely to boot or receive at a
public destination address. Buyer wallets, identity signers, facilitator auth,
Stripe keys, and model-provider keys are separate server-only roles.

In-memory payment, SIWX, and HTTP idempotency defaults are for one-process
development. Before multiple replicas, inject the durable stores documented by
the installed package surface and test a same-key replay from another instance.

See `AGENTS.md` for extension/adaptor rules and the repository documentation
for release channels, x402, retries, deployment, and production checks.
