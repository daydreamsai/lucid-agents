# @lucid-agents/geo-demand-api

Paid geo-demand API for agent buyers.

## What this package provides

Three paid endpoints:

- `GET /v1/demand/index` — ZIP/city-level demand index
- `GET /v1/demand/trend` — trend velocity and direction
- `GET /v1/demand/anomalies` — anomaly flags and anomaly score

All endpoints enforce payment and freshness checks.

## Buyer-facing API contract

### Payment headers (required)

- `x-lucid-payment`: payment token/proof
- `x-lucid-buyer-id`: buyer identity (optional but recommended)

### Location query (required)

Pass either:

- `zip=94107`

or

- `city=San Francisco&state=CA`

### Endpoint details

1. `GET /v1/demand/index`
- Price: 1.50 USD
- Returns: index value, percentile, sample size, as-of timestamp

2. `GET /v1/demand/trend`
- Price: 1.50 USD
- Returns: velocity, direction (`up`/`flat`/`down`), current index, previous index

3. `GET /v1/demand/anomalies`
- Price: 2.00 USD
- Returns: spike/drop/volatility/seasonality-break flags, score, explanatory details

### Success response shape

```json
{
  "data": {
    "location": {
      "kind": "zip",
      "key": "zip:94107",
      "zip": "94107"
    },
    "asOf": "2026-03-01T00:00:00.000Z"
  },
  "meta": {
    "asOf": "2026-03-01T00:00:00.000Z",
    "freshnessMs": 12345,
    "payment": {
      "transactionId": "txn_123",
      "chargedUsd": 1.5,
      "buyerId": "did:lucid:buyer:1"
    }
  }
}
```

### Error codes

- `INVALID_QUERY` (400)
- `NOT_FOUND` (404)
- `INSUFFICIENT_HISTORY` (422)
- `PAYMENT_REQUIRED` (402)
- `DATA_STALE` (503)
- `INTERNAL_ERROR` (500)

## Freshness behavior

Freshness is enforced per request using repository `updatedAt` time.  
If dataset age exceeds `maxDataAgeMs`, all three paid endpoints return `503 DATA_STALE`.

## Running tests

```bash
pnpm --filter @lucid-agents/geo-demand-api test
```

Test suite includes:

- contract tests
- logic tests
- paid endpoint tests
- freshness tests