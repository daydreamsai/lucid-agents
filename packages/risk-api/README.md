# @lucid-agents/risk-api

Counterparty Risk Graph Intelligence API - A paid graph-intelligence API that provides wallet/entity clustering, exposure paths, and risk scores.

## Overview

This package provides machine-readable counterparty risk context for payment and underwriting agents before transacting. All endpoints are monetized via x402 payment protocol.

## Installation

```bash
bun add @lucid-agents/risk-api
```

## API Endpoints

### POST /v1/risk/score
Calculate counterparty risk score with evidence.

**Price:** $0.10 per call

**Request:**
```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
  "network": "eip155:1",
  "transaction_context": {
    "amount": "1000",
    "currency": "USDC"
  },
  "threshold": 0.7,
  "lookback_days": 30
}
```

**Response:**
```json
{
  "risk_score": 0.65,
  "risk_factors": [
    {
      "factor": "sanctions_proximity",
      "weight": 0.4,
      "evidence": ["Entity within 2 hops of sanctioned address"]
    }
  ],
  "cluster_id": "cluster_abc123",
  "sanctions_proximity": 2,
  "evidence_refs": ["ref_001", "ref_002"],
  "freshness": {
    "data_timestamp": "2026-02-27T01:00:00Z",
    "staleness_seconds": 120
  },
  "confidence": 0.85
}
```

### GET /v1/risk/exposure-paths
Find exposure paths to high-risk entities.

**Price:** $0.15 per call

**Request:**
```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
  "network": "eip155:1",
  "max_depth": 3,
  "min_confidence": 0.6
}
```

**Response:**
```json
{
  "paths": [
    {
      "path": [
        "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        "0x1234567890123456789012345678901234567890"
      ],
      "risk_score": 0.8,
      "confidence": 0.75,
      "evidence": ["Direct transaction link"]
    }
  ],
  "total_paths": 1,
  "freshness": {
    "data_timestamp": "2026-02-27T01:00:00Z",
    "staleness_seconds": 60
  }
}
```

### GET /v1/risk/entity-profile
Get comprehensive entity risk profile.

**Price:** $0.20 per call

**Request:**
```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
  "network": "eip155:1"
}
```

**Response:**
```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
  "cluster_id": "cluster_xyz789",
  "labels": ["exchange", "high-volume"],
  "risk_indicators": {
    "sanctions_proximity": 0,
    "mixer_exposure": false,
    "high_risk_counterparties": 2
  },
  "transaction_stats": {
    "total_volume": "1000000",
    "transaction_count": 150,
    "first_seen": "2025-01-01T00:00:00Z",
    "last_seen": "2026-02-26T23:00:00Z"
  },
  "freshness": {
    "data_timestamp": "2026-02-27T01:00:00Z",
    "staleness_seconds": 90
  },
  "confidence": 0.92
}
```

## Usage with Lucid Agents

```typescript
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { addRiskApiEntrypoints } from '@lucid-agents/risk-api';

const agent = await createAgent({
  name: 'risk-intelligence',
  version: '1.0.0',
  description: 'Counterparty Risk Graph Intelligence API',
})
  .use(http())
  .use(payments({ config: paymentsFromEnv() }))
  .build();

const appResult = await createAgentApp(agent);
addRiskApiEntrypoints(appResult);

const server = Bun.serve({
  port: 3000,
  fetch: appResult.app.fetch,
});

console.log(`Risk API running at http://localhost:${server.port}`);
```

## Configuration

Set the following environment variables:

```bash
FACILITATOR_URL=https://facilitator.x402.org
PAYMENTS_RECEIVABLE_ADDRESS=0xYourAddress
NETWORK=base-sepolia
```

## Payment Integration (x402)

All endpoints require payment via the x402 protocol. Without a valid `X-PAYMENT` header, endpoints return `402 Payment Required` with payment instructions:

```json
{
  "x402Version": 2,
  "price": "0.10",
  "payTo": "0x...",
  "network": "eip155:8453"
}
```

## License

MIT
