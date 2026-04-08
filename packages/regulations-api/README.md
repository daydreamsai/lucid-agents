# @lucid-agents/regulations-api

Paid API for machine-readable regulation/policy deltas, impact tagging, and control mapping.

## What buyers get

1. Regulation deltas with clause-level machine-readable changes.
2. Impact tags with severity scoring and rationale.
3. Control-to-regulation mapping to accelerate policy implementation work.
4. Freshness metadata in every response (`lastUpdatedAt`, `freshnessSeconds`, `stale`).

## Authentication / payment

All endpoints are paid. Send a payment token in:

- `x-lucid-payment-token: <token>`

For local/testing, default accepted token is:

- `paid-test-token`

You can replace payment validation by injecting a custom `PaymentGateway`.

## Endpoints

### `GET /v1/regulations/delta`

Returns changes between a date range.

Query:
- `jurisdiction` (required)
- `from` (optional ISO timestamp)
- `to` (optional ISO timestamp)
- `limit` (optional, default `50`, max `200`)

### `GET /v1/regulations/impact`

Returns impact assessments derived from deltas.

Query:
- `jurisdiction` (required)
- `from` (optional ISO timestamp)
- `to` (optional ISO timestamp)
- `deltaId` (optional filter)
- `limit` (optional, default `50`, max `200`)

### `POST /v1/regulations/map-controls`

Maps buyer controls to relevant regulation clauses.

Body:
- `jurisdiction` (required)
- `controls` (required, non-empty array)
- `regulationIds` (optional filter)
- `maxMatchesPerControl` (optional, default `5`, max `20`)

## Programmatic usage

```ts
import { createRegulationsApiServer } from "@lucid-agents/regulations-api";

const server = createRegulationsApiServer();
server.listen(8080);
```

## Testing

This package includes:
- Contract tests
- Logic tests
- Paid endpoint tests
- Freshness tests

Run tests:

```bash
pnpm --filter @lucid-agents/regulations-api test
```