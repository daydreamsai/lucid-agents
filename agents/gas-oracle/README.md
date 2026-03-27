# Gas Oracle Agent — @lucid-agents/gas-oracle

> **Issue:** [daydreamsai/lucid-agents#178](https://github.com/daydreamsai/lucid-agents/issues/178)
> Real-Time Gas & Inclusion Probability Oracle

A Lucid agent that exposes three REST endpoints for real-time EVM gas data, inclusion probability forecasting, and network congestion analysis. All endpoints include `freshness_ms` and `confidence_score` and are protected by [x402](https://x402.org) micropayments.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/gas/quote` | Fee recommendation + inclusion probability curve |
| `GET` | `/v1/gas/forecast` | Future base-fee predictions |
| `GET` | `/v1/gas/congestion` | Current network congestion state |
| `GET` | `/health` | Liveness check |

---

## Quick Start

```bash
cp .env.example .env
# Edit .env — set RPC_URL and PAYMENTS_RECEIVABLE_ADDRESS

bun install
bun run dev
```

---

## API Reference

### GET /v1/gas/quote

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `chain` | string | *required* | Chain identifier (e.g. `ethereum`, `base`) |
| `urgency` | `low\|medium\|high\|urgent` | `medium` | Desired inclusion speed |
| `targetBlocks` | number | — | Desired confirmation block horizon |
| `txType` | `legacy\|eip1559\|eip4844` | — | Transaction type |

**Response:**

```json
{
  "chain": "ethereum",
  "urgency": "medium",
  "recommended_max_fee": "30000000000",
  "priority_fee": "1500000000",
  "base_fee": "25000000000",
  "inclusion_probability_curve": [
    { "blocks": 1, "probability": 0.1393 },
    { "blocks": 5, "probability": 0.5276 }
  ],
  "confidence_score": 0.92,
  "freshness_ms": 134,
  "tx_type": "eip1559",
  "estimated_wait_seconds": 72
}
```

### GET /v1/gas/forecast

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `chain` | string | *required* | Chain identifier |
| `horizonMinutes` | number | `60` | Forecast window (max 1440) |
| `granularity` | number | `5` | Step size in minutes |

**Response:**

```json
{
  "chain": "ethereum",
  "horizon_minutes": 60,
  "granularity_minutes": 5,
  "forecast": [
    { "timestamp_ms": 1700000300000, "base_fee_gwei": 20.3, "confidence_score": 0.913 }
  ],
  "confidence_score": 0.75,
  "freshness_ms": 98
}
```

### GET /v1/gas/congestion

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `chain` | string | Chain identifier |

**Response:**

```json
{
  "chain": "ethereum",
  "congestion_state": "moderate",
  "utilisation_percent": 72.4,
  "pending_tx_count": 8500,
  "base_fee_gwei": 23.5,
  "confidence_score": 0.9,
  "freshness_ms": 105
}
```

---

## Architecture

```
agents/gas-oracle/
├── src/
│   ├── schemas/        — Zod input/output schemas
│   ├── logic/
│   │   ├── gas-estimation.ts   — Fee & curve computation
│   │   ├── congestion-analysis.ts — Block utilisation analysis
│   │   └── rpc-client.ts       — JSON-RPC helpers
│   ├── routes/
│   │   └── gas.ts      — Hono route handlers
│   ├── agent.ts        — App factory
│   └── index.ts        — Entry point
└── tests/
    ├── contract/       — Schema validation tests
    ├── logic/          — Unit tests for estimation & congestion logic
    ├── integration/    — Endpoint tests (network-free + live)
    └── freshness/      — Freshness / staleness contract tests
```

---

## Running Tests

```bash
# Unit + contract + freshness tests (no network needed)
bun test

# Include live RPC integration tests
INTEGRATION_TESTS=true bun test
```

---

## Payments

All routes are guarded by [x402](https://x402.org) micropayments. Set `PAYMENTS_RECEIVABLE_ADDRESS` in your `.env` to receive fees. The `NETWORK` variable controls which chain payments settle on.

---

## Environment Variables

See [`.env.example`](.env.example) for a full list.

---

## License

MIT — [daydreamsai/lucid-agents](https://github.com/daydreamsai/lucid-agents)
