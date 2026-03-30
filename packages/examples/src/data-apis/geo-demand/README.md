# Geo Demand Pulse Index API

A paid geo-demand API that sells ZIP/city-level demand indices, trend velocity, and anomaly flags for agent consumers.

## Overview

This API provides localized demand signals with reliable update cadence for pricing and inventory agents.

## Endpoints

| Endpoint | Method | Price | Description |
|----------|--------|-------|-------------|
| `/v1/demand/index` | GET | $0.50 | Get demand index for a location |
| `/v1/demand/trend` | GET | $0.75 | Get demand trend velocity |
| `/v1/demand/anomalies` | GET | $1.00 | Get demand anomaly flags |

## Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `geoType` | string | Yes | Geography type: `zip`, `city`, `region` |
| `geoCode` | string | Yes | Geography code (e.g., "94102", "san-francisco") |
| `category` | string | No | Product/service category filter |
| `lookbackWindow` | string | No | Time window: `7d`, `30d`, `90d` (default: `30d`) |
| `seasonalityMode` | string | No | Seasonality adjustment: `raw`, `adjusted` |

## Response Schema

```json
{
  "demand_index": 78.5,
  "velocity": 2.3,
  "confidence_interval": { "lower": 72.1, "upper": 84.9 },
  "anomaly_flags": [],
  "comparable_geos": ["94103", "94104"],
  "freshness": {
    "generated_at": "2024-01-15T10:30:00Z",
    "staleness_ms": 1800000,
    "sla_status": "fresh"
  },
  "confidence": 0.92
}
```

## Usage Example

```typescript
import { createX402Fetch } from '@lucid-agents/payments';

const x402Fetch = createX402Fetch({
  privateKey: process.env.WALLET_PRIVATE_KEY,
});

const response = await x402Fetch(
  'https://api.example.com/v1/demand/index?geoType=zip&geoCode=94102'
);
const data = await response.json();
```

## Running

```bash
bun run packages/examples/src/data-apis/geo-demand/server.ts
bun test packages/examples/src/data-apis/geo-demand/
```
