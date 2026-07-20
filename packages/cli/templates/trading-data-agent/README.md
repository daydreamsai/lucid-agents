# Trading data service

Merchant-style Lucid example that exposes mock OHLCV data through priced HTTP
entrypoints and Agent Card-shaped discovery.

> **Migration required:** the current repository generator still composes this
> legacy template with pre-v3 runtime/dependency wiring. It is not included in
> the packed-workspace generated-project verification matrix and should not be
> used as a starting point until that implementation is migrated. This README
> describes the target contract for the migration.

This generated project uses Lucid's own entrypoint/task profile; it is not an
official A2A v1 implementation. Any AP2 role is metadata only.

## Run

Review `.env.example`, then provide a testnet facilitator, canonical network,
and receiving address in `.env`:

```dotenv
PAYMENTS_FACILITATOR_URL=https://YOUR_TESTNET_FACILITATOR
PAYMENTS_NETWORK=eip155:84532
PAYMENTS_RECEIVABLE_ADDRESS=0xYOUR_EVM_ADDRESS
```

After the template implementation is migrated, `bun install`,
`bun run type-check`, and `bun run dev` must all pass before use.

## Entrypoints

- `getMarketData`: bounded mock OHLCV response, currently priced at `$0.005`.
- `getPrice`: mock current price, currently priced at `$0.001`.

Prices are USD decimal strings, not token base units.

An unpaid request should be challenged:

```bash
curl -i http://localhost:3000/entrypoints/getPrice/invoke \
  -H 'content-type: application/json' \
  -H 'idempotency-key: trading-data-read-000001' \
  --data '{"input":{"symbol":"BTC/USD"}}'
```

Expect `402` and `PAYMENT-REQUIRED`. Use a compatible testnet x402 buyer to
verify a paid `2xx` plus `PAYMENT-RESPONSE`; plain curl cannot complete the
payment.

## Configuration

- `PAYMENTS_FACILITATOR_URL`: external x402 facilitator base URL.
- `PAYMENTS_FACILITATOR_AUTH`: optional server-only bearer token.
- `PAYMENTS_NETWORK`: canonical CAIP-2 network.
- `PAYMENTS_RECEIVABLE_ADDRESS`: seller destination on that network.

Template/wizard defaults are development inputs, not production endorsements.
Before real data or funds, replace mock generation, set size/time/concurrency
limits, add durable payment/idempotency storage, verify provider behavior, and
publish reconciliation/refund semantics.

The `trading-recommendation-agent` template is the paired buyer example.
See `AGENTS.md` before modifying the generated runtime.
