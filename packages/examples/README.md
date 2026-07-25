# Lucid Agents examples

This package contains runnable, type-checked examples for the Lucid Agents
monorepo. Start with the focused example for the capability you need; use the
kitchen sink to see cross-package composition.

## Payment methods

[`src/payment-methods/README.md`](./src/payment-methods/README.md) is the
canonical payment guide. Its coverage contract is keyed one-for-one to the
repository payment support matrix, so CI rejects a newly documented method
without example code and executable proof.

The corresponding documentation tutorials are
[Every x402 payment method](../../lucid-docs/content/docs/examples/x402-payment-methods.mdx)
and
[Every MPP payment method](../../lucid-docs/content/docs/examples/mpp-payment-methods.mdx).

| Area                    | Focused source                                                                           | What it demonstrates                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| x402 seller methods     | [`payment-methods/x402.ts`](./src/payment-methods/x402.ts)                               | EVM/Solana exact, EVM upto, EVM batch settlement, SIWX, reconciliation extensions |
| x402 Stripe destination | [`payment-methods/x402.ts`](./src/payment-methods/x402.ts)                               | Base-mainnet dynamic deposit addresses                                            |
| MPP charge methods      | [`payment-methods/mpp.ts`](./src/payment-methods/mpp.ts)                                 | Tempo, Stripe, EVM, custom, Lightning descriptor, method negotiation              |
| Tempo sessions          | [`payment-methods/mpp.ts`](./src/payment-methods/mpp.ts)                                 | TIP-1034 invoke units and SSE metering                                            |
| Custom MPP provider     | [`mpp/custom-verifier-reference.ts`](./src/mpp/custom-verifier-reference.ts)             | verifier trust boundary, idempotent settlement, receipt redaction                 |
| Outgoing policies       | [`payments/policy-agent/index.ts`](./src/payments/policy-agent/index.ts)                 | budgets, allow/block lists, rate limits, paid Fetch                               |
| Incoming policies       | [`payments/receivables-policies/index.ts`](./src/payments/receivables-policies/index.ts) | verified-payer limits and sender controls                                         |
| Analytics               | [`analytics/index.ts`](./src/analytics/index.ts)                                         | summaries, transactions, CSV, JSON                                                |

The older `mpp-paid-service.ts` and catalog store remain small runnable server
examples. The payment-method factories are the source of truth for the complete
method surface.

## All examples

| Directory          | Example                                                                        | External requirements                                                       |
| ------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `core/`            | full HTTP agent and local runtime-auth loop                                    | full agent uses configured identity/payment services; runtime-auth is local |
| `payment-methods/` | every supported payment method                                                 | smoke path is deterministic; live rails need their documented provider      |
| `payments/`        | paid service plus outgoing/incoming policy agents                              | x402 facilitator and funded buyer for live payment                          |
| `mpp/`             | small Tempo charge server and custom provider reference                        | Tempo/provider configuration for live payment                               |
| `analytics/`       | payment analytics endpoints                                                    | payment configuration                                                       |
| `catalog/`         | YAML catalog generating MPP-paid routes                                        | Tempo configuration for live payment                                        |
| `kitchen-sink/`    | HTTP, A2A, AP2, payments, MPP, analytics, scheduler, catalog, wallet, identity | default profile is local and free                                           |
| `a2a/`             | multi-agent task flow                                                          | local only                                                                  |
| `scheduler/`       | leased scheduled paid calls                                                    | payment configuration for live calls                                        |
| `identity/`        | read-only discovery and explicitly gated writes                                | RPC/signer only for opt-in writes                                           |
| `wallet/`          | Thirdweb Engine wallet operations                                              | Thirdweb credentials and network access                                     |

The identity package also contains focused maintainer examples in
`packages/identity/examples/` for deployment and transfer-only flows. Both
on-chain examples are write-capable and must be reviewed before supplying a
signer.

## Quick start

Run the kitchen sink without a wallet or external service:

```bash
bun install
bun run packages/examples/src/kitchen-sink/index.ts
```

Run a focused source file:

```bash
bun run packages/examples/src/mpp/mpp-paid-service.ts
bun run packages/examples/src/payments/paid-service/index.ts
```

Factory-style examples under `payment-methods/` are intended to be imported by
an application bootstrap after it injects network, provider, signer, and durable
storage capabilities.

## Executable contracts

```bash
# Every support-matrix row has example code and proof
bun test packages/examples/src/__tests__/payment-method-examples.test.ts

# Cross-package agents build, boot, discover, challenge, and respond
bun test packages/examples/src/__tests__/smoke.test.ts

# Kitchen-sink HTTP, SSE, tasks, protocols, and state
bun test packages/examples/src/kitchen-sink/__tests__

# Deterministic x402 buyer/seller channel lifecycle
bun test packages/examples/src/__tests__/x402-batch-lifecycle.test.ts

# Custom MPP verifier and public HTTP conformance
bun test packages/examples/src/__tests__/custom-mpp-conformance.e2e.test.ts

# Real pinned Tempo charge and TIP-1034 session lifecycle
bun run scripts/tempo-localnet.ts -- \
  bun test packages/examples/src/__tests__/tempo-localnet.e2e.ts
```

The default smoke contracts do not prove public-chain funding, Stripe
settlement, or Lightning interoperability. Those boundaries are called out in
the payment-method guide instead of being simulated and mislabeled as live E2E.

## Quality checks

```bash
bun run --cwd packages/examples type-check
bun run --cwd packages/examples lint
bun run --cwd packages/examples format:check
```
