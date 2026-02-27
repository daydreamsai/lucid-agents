# Gas Oracle Data API

Real-Time Gas & Inclusion Probability Oracle for EVM chains.

## Supported Chains

- Ethereum, Base, Optimism, Arbitrum, Polygon

## Endpoints

All endpoints follow: `POST /entrypoints/{key}/invoke`

### GET /health

Health check (no payment required).

### POST /entrypoints/gas-quote/invoke

Get recommended gas fees for a transaction.

```bash
curl -X POST http://localhost:3000/entrypoints/gas-quote/invoke \
  -H "Content-Type: application/json" \
  -H "X-PAYMENT: <payment-header>" \
  -d '{"chain":"ethereum","urgency":"high","tx_type":"swap","recent_failure_tolerance":0.03}'
```

Response:
```json
{
  "recommended_max_fee": "60000000000",
  "priority_fee": "3000000000",
  "estimated_cost_usd": 2.85,
  "urgency": "high",
  "chain": "ethereum",
  "freshness": {
    "fetched_at": "2026-02-28T00:00:00.000Z",
    "block_number": 19500000,
    "block_age_ms": 3200,
    "stale": false,
    "data_source": "cached"
  },
  "confidence": {
    "score": 0.87,
    "factors": ["sample_size:high", "volatility:low", "block_age:fresh"]
  }
}
```

### POST /entrypoints/gas-forecast/invoke

Get gas fee forecast with inclusion probability curve.

```bash
curl -X POST http://localhost:3000/entrypoints/gas-forecast/invoke \
  -H "Content-Type: application/json" \
  -H "X-PAYMENT: <payment-header>" \
  -d '{"chain":"base","target_blocks":5}'
```

Response:
```json
{
  "chain": "base",
  "inclusion_probability_curve": [
    {"max_fee":"200000","priority_fee":"50000","inclusion_probability":0.65,"target_block":1},
    {"max_fee":"200000","priority_fee":"50000","inclusion_probability":0.78,"target_block":2},
    {"max_fee":"200000","priority_fee":"50000","inclusion_probability":0.88,"target_block":3},
    {"max_fee":"200000","priority_fee":"50000","inclusion_probability":0.94,"target_block":4},
    {"max_fee":"200000","priority_fee":"50000","inclusion_probability":0.98,"target_block":5}
  ],
  "forecast_horizon_blocks": 5,
  "trend": "stable",
  "freshness": { "fetched_at": "...", "block_number": 25000000, "block_age_ms": 800, "stale": false, "data_source": "live" },
  "confidence": { "score": 0.92, "factors": ["sample_size:high", "trend:stable"] }
}
```

### POST /entrypoints/gas-congestion/invoke

Get current chain congestion state.

```bash
curl -X POST http://localhost:3000/entrypoints/gas-congestion/invoke \
  -H "Content-Type: application/json" \
  -H "X-PAYMENT: <payment-header>" \
  -d '{"chain":"ethereum"}'
```

Response:
```json
{
  "chain": "ethereum",
  "congestion_state": "moderate",
  "gas_utilization_pct": 62.5,
  "pending_tx_count": 18500,
  "base_fee": "30000000000",
  "base_fee_trend": "stable",
  "recommended_action": "proceed",
  "mempool_visibility": "partial",
  "freshness": { "fetched_at": "...", "block_number": 19500000, "block_age_ms": 5000, "stale": false, "data_source": "cached" },
  "confidence": { "score": 0.85, "factors": ["sample_size:medium", "mempool_visibility:partial"] }
}
```

## Error Responses

All errors return:
```json
{
  "code": 400,
  "message": "Invalid chain: 'solana' is not supported",
  "details": "Supported chains: ethereum, base, optimism, arbitrum, polygon",
  "request_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

## Development

```bash
bun install
bun run dev          # Start server
bun test             # Run all tests
bun test:unit        # Unit tests only
bun test:integration # Integration tests only
```

## Architecture

- **EIP-1559 fee estimation**: `base_fee * (9/8)^n` with urgency-mapped block targets
- **Sigmoid inclusion probability**: Uses `max_fee - projected_base` as effective tip
- **Chain-configurable congestion**: Per-chain thresholds with 20-block EMA rolling window
- **In-memory cache**: Chain-specific TTL (ethereum: 12s, L2s: 2s)
- **Deterministic mock provider**: Seeded PRNG for reproducible tests
