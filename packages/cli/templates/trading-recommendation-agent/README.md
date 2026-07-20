# Trading recommendation service

Buyer-style Lucid example that purchases mock data from the paired trading data
service and derives a demonstration BUY/SELL/HOLD signal.

> **Migration required:** the current repository generator still composes this
> legacy template with pre-v3 runtime/dependency/task-client wiring. It is not
> included in the packed-workspace generated-project verification matrix and
> should not be used as a starting point until that implementation is migrated.
> This README describes the target contract for the migration.

The package namespace is `a2a`, but this project uses Lucid Agent Card,
entrypoint, and task contracts—not the official A2A v1 binding.

## Prerequisites

- Start the generated `trading-data-agent` service on an allowlisted URL.
- Use a dedicated testnet buyer wallet with a small balance.
- Configure the same canonical payment network as the seller.
- Review recipient and spend policy before allowing automatic signatures.

```dotenv
DATA_AGENT_URL=http://localhost:3001
AGENT_WALLET_TYPE=local
AGENT_WALLET_PRIVATE_KEY=0xSERVER_ONLY_BUYER_KEY
PAYMENTS_NETWORK=eip155:84532
```

After the template implementation is migrated, `bun install`,
`bun run type-check`, and `bun run dev` must all pass before use.

## Entrypoints

- `generateSignal`: obtains a larger market-data result and runs the selected
  demonstration strategy.
- `quickSignal`: obtains only a current mock price.

```bash
curl -i http://localhost:3000/entrypoints/generateSignal/invoke \
  -H 'content-type: application/json' \
  -H 'idempotency-key: recommendation-request-000001' \
  --data '{"input":{"symbol":"BTC/USD","strategy":"momentum"}}'
```

The recommendation service makes the downstream payment. A successful outer
response does not by itself prove downstream settlement; retain sanitized
operation/receipt evidence and validate the returned data schema.

## Safety boundary

The generated example demonstrates composition, not a production approval or
trading system. Before real funds:

- allowlist the exact seller origin, payee, network, asset, and maximum amount;
- use durable budget/idempotency state across replicas;
- cap tool/model retries, concurrency, input, duration, and total spend;
- preserve one business operation ID through payment and task polling;
- handle ambiguous timeout after signing by reconciliation, not blind retry;
- secure task access tokens and redact credentials from logs; and
- replace mock strategies with reviewed domain logic.

Read `AGENTS.md` for the current direct-invoke and Lucid-task client shapes.
