# Geo Demand Pulse Index API

A paid geo-demand API that sells ZIP/city-level demand indices, trend velocity, and anomaly flags for agent buyers.

## Endpoints

### POST /entrypoints/demand-index/invoke
Returns current demand index with velocity and confidence intervals.

### POST /entrypoints/demand-trend/invoke  
Returns trend analysis with direction, strength, and historical data points.

### POST /entrypoints/demand-anomalies/invoke
Detects demand anomalies with severity flags and baseline statistics.

## Features

- Strict Zod schema validation
- Freshness metadata (dataAsOf, computedAt, staleAfter, ttlSeconds)
- 95% confidence intervals
- Comparable geos ranking
- Seasonality adjustment (none/yoy/mom/auto)
- Lookback windows (7d/30d/90d/365d)
- x402 payment support

## Testing

```bash
bun test packages/examples/src/data-apis/geo-demand-pulse/__tests__/
```

## Configuration

```bash
PAYMENTS_RECEIVABLE_ADDRESS=0x...
FACILITATOR_URL=https://facilitator.daydreams.systems
NETWORK=base-sepolia
PRICE_DEMAND_INDEX=0.001
PRICE_TREND=0.002
PRICE_ANOMALIES=0.003
PORT=3000
```
