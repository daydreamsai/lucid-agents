# Supplier Reliability Signal Marketplace API

A paid supplier-intelligence API selling lead-time drift, fill-rate risk, and disruption probability via x402 payment protocol.

## Endpoints

### GET /v1/suppliers/score ($0.10)
Get normalized supplier reliability score with confidence bands.

```json
// Input
{ "supplierId": "SUP001", "category": "electronics", "region": "APAC" }

// Output
{
  "supplier_id": "SUP001",
  "supplier_score": 91.9,
  "fill_rate": 0.95,
  "on_time_delivery_rate": 0.92,
  "quality_score": 88,
  "confidence": { "level": "high", "score": 0.83, "sample_size": 1250 },
  "freshness": { "freshness_ms": 3600000, "last_updated": "2024-01-15T10:00:00.000Z", "source": "supplier-db-v1" }
}
```

### GET /v1/suppliers/lead-time-forecast ($0.25)
Get lead time forecast with P50/P95 percentiles and drift analysis.

```json
// Input
{ "supplierId": "SUP001", "category": "electronics", "region": "APAC", "horizonDays": 30 }

// Output
{
  "supplier_id": "SUP001",
  "category": "electronics",
  "region": "APAC",
  "horizon_days": 30,
  "lead_time_p50": 14.2,
  "lead_time_p95": 20.4,
  "lead_time_drift": 1.0,
  "trend": "stable",
  "confidence": { "level": "high", "score": 0.83, "sample_size": 1250 },
  "freshness": { "freshness_ms": 3600000, "last_updated": "2024-01-15T10:00:00.000Z", "source": "forecast-model-v2" }
}
```

### GET /v1/suppliers/disruption-alerts ($0.50)
Get disruption probability and active risk alerts with recommended actions.

```json
// Input
{ "supplierId": "SUP002", "riskTolerance": "medium" }

// Output
{
  "supplier_id": "SUP002",
  "disruption_probability": 0.42,
  "risk_level": "high",
  "alert_reasons": [
    { "code": "port_congestion", "description": "Port congestion affecting shipments", "severity": "warning", "detected_at": "2024-01-15T10:00:00.000Z" }
  ],
  "recommended_actions": ["Consider activating backup suppliers", "Increase safety stock levels"],
  "confidence": { "level": "medium", "score": 0.68, "sample_size": 890 },
  "freshness": { "freshness_ms": 7200000, "last_updated": "2024-01-15T08:00:00.000Z", "source": "risk-engine-v1" }
}
```

## Error Codes
- `invalid_input` - Request validation failed
- `supplier_not_found` - Supplier ID not found
- `payment_required` - x402 payment required
- `rate_limited` - Too many requests
- `stale_data` - Data exceeds freshness threshold

## Running

```bash
bun run packages/examples/src/supplier-reliability-api/index.ts

# With custom config
PORT=3002 PAYTO_ADDRESS=0x... NETWORK=eip155:84532 bun run packages/examples/src/supplier-reliability-api/index.ts
```

## Tests

```bash
cd packages/examples/src/supplier-reliability-api && bun test
```

## Architecture

Built with: @lucid-agents/core, @lucid-agents/http, @lucid-agents/hono, @lucid-agents/payments
