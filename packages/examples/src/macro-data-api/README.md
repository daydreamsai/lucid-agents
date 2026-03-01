# Macro Event Impact Vector API (v1)

Paid Data API for agent consumers.

## Endpoints

- `GET /v1/macro/events`
- `GET /v1/macro/impact-vectors`
- `POST /v1/macro/scenario-score`

All endpoints are monetized via x402 paywall when paywall is enabled.

## Query/Input Contract

- `eventTypes`: CSV (GET) or array (POST)
- `geography`: `US | EU | APAC | GLOBAL`
- `sectorSet`: CSV (GET) or array (POST)
- `horizon`: `1w | 1m | 3m | 6m | 12m`
- `scenarioAssumptions` (POST only):
  - `inflationShock`, `oilShock`, `policySurprise`, `demandShock` in `[0,1]`

## Response Contract

Responses include freshness and confidence metadata.

- `/v1/macro/events` returns `event_feed`
- `/v1/macro/impact-vectors` returns `impact_vector`, `confidence_band`, `sensitivity_breakdown`
- `/v1/macro/scenario-score` returns `scenario_score`, `impact_vector`, `confidence_band`, `sensitivity_breakdown`

All successful responses include:

- `freshness`
- `confidence`

All validation failures return:

- `error.code`
- `error.message`
- `error.details`

## Example Requests

```sh
curl "http://localhost:3000/v1/macro/events?eventTypes=cpi,fed_rate&geography=US&horizon=1m"
```

```sh
curl "http://localhost:3000/v1/macro/impact-vectors?eventTypes=cpi,fed_rate&geography=US&sectorSet=equities,bonds&horizon=3m"
```

```sh
curl -X POST "http://localhost:3000/v1/macro/scenario-score" \
  -H "content-type: application/json" \
  -d '{
    "eventTypes": ["CPI", "FED_RATE"],
    "geography": "US",
    "sectorSet": ["EQUITIES", "BONDS"],
    "horizon": "3m",
    "scenarioAssumptions": {
      "inflationShock": 0.8,
      "oilShock": 0.2,
      "policySurprise": 0.6,
      "demandShock": 0.4
    }
  }'
```

## Payment + Wallet Configuration

Set environment variables for x402 receivables:

- `PAYMENTS_FACILITATOR_URL`
- `PAYMENTS_FACILITATOR_AUTH` (optional)
- `PAYMENTS_NETWORK`
- `PAYMENTS_RECEIVABLE_ADDRESS`

Run:

```sh
bun run packages/examples/src/macro-data-api/index.ts
```
