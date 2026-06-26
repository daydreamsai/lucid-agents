# Macro Event Impact Vector API

Paid macro-data API for event-normalized impact vectors across sectors, assets, and supply chains, monetized with x402 micropayments.

## Runtime
- TypeScript + Bun
- Lucid Agents SDK stack: `@lucid-agents/core`, `@lucid-agents/http`, `@lucid-agents/payments`, `@lucid-agents/wallet`, `@lucid-agents/identity`, `@lucid-agents/a2a`, `@lucid-agents/ap2`, `@lucid-agents/hono`
- Zod v4 schemas via `z.toJSONSchema`

## Pricing
- `GET /v1/macro/events`: FREE
- `GET /v1/macro/impact-vectors`: `0.001 USDC` per call
- `POST /v1/macro/scenario-score`: `0.002 USDC` per call

## Environment
Required:
- `PAYMENTS_RECEIVABLE_ADDRESS`
- `FACILITATOR_URL=https://facilitator.daydreams.systems`
- `NETWORK=base`

See `.env.example`.

## Endpoints

### GET /v1/macro/events
Query params:
- `eventTypes` (optional CSV): `rate-decision,cpi,gdp,geopolitical`
- `geography` (optional CSV): ex: `US,EU,Global`

Response:
- `event_feed`
- `freshness` (`fetchedAt`, `staleness`, `confidence`)

### GET /v1/macro/impact-vectors (paid)
Headers:
- `x402-payment: paid`

Query params:
- `sectorSet` (CSV): ex `equities,SPX,semiconductors/fabless`
- `horizon`: `7d|30d|90d|180d`

Response:
- `impact_vector`
- `confidence_band`
- `sensitivity_breakdown`
- `freshness`

### POST /v1/macro/scenario-score (paid)
Headers:
- `x402-payment: paid`

Body:
```json
{
  "assumptions": {
    "rateChangeBps": -25,
    "cpiDelta": -0.2,
    "gdpDelta": 0.3,
    "geopoliticalRisk": 0.3
  },
  "targets": ["SPX", "semiconductors"],
  "horizon": "90d"
}
```

Response:
- `scenario_score`
- `impact_vector`
- `confidence_band`
- `sensitivity_breakdown`
- `freshness`

## Scripts
- `bun run dev`
- `bun run start`
- `bun run test`
- `bun run test:contract`
- `bun run test:logic`
- `bun run test:integration`
- `bun run test:freshness`

## x402 Behavior
Monetized endpoints return `402` with error envelope when payment is absent/invalid.

## Performance Target
Cached path target: p95 < `200ms`.
