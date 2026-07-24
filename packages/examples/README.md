# Examples

This package contains example implementations demonstrating how to use the lucid-agents framework.

## Structure

- `src/core/` - Core framework examples (HTTP, payments, identity, streaming)
- `src/identity/` - ERC-8004 identity examples
- `src/a2a/` - Agent Card-shaped discovery and Lucid task-profile examples;
  these are not the official A2A v1 binding

## Running Examples

Examples can be run directly with Bun:

```bash
# From the examples package
bun run src/core/full-agent.ts

# Or from the repo root
bun run packages/examples/src/core/full-agent.ts
```

## Type Checking

All examples are type-checked:

```bash
bun run type-check
```

## Deterministic payment lifecycle tests

The x402 batch lifecycle runs without funded wallets or public services:

```bash
bun run --filter @lucid-agents/payments build
bun test packages/examples/src/__tests__/x402-batch-lifecycle.test.ts
```

It drives the official batch buyer through the public paid Fetch API and a
protected Lucid HTTP entrypoint. The test covers the initial deposit,
cumulative vouchers, a lost initial-deposit response followed by cold durable
buyer discovery, another ambiguous committed response and corrective restart,
replay and signature rejection, concurrent seller access, incremental
accounting, and claim/settle of that same lifecycle-created channel. A separate
contract covers terminal refund economics. SQLite runs these contracts by
default. Set `TEST_PAYMENT_E2E_POSTGRES_URL` to run the same buyer-to-seller
restart, race, claim/settle, and terminal economics contracts against Postgres;
required CI supplies an isolated Postgres service automatically.

The facilitator and JSON-RPC endpoints are isolated deterministic boundaries,
so failed assertions can report channel IDs, cumulative values, response
statuses, and balances without exposing credentials. They do not prove EVM
contract deployment or transaction execution; that evidence belongs in the
separate Base Sepolia sandbox lifecycle.

## Linting

Lint examples:

```bash
bun run lint
bun run lint:fix
```
