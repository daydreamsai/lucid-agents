# ERC-8004 Identity Reputation Signal API

A paid identity data API that sells agent trust/reputation signals from ERC-8004 plus verified offchain performance evidence.

## Overview

This module provides HTTP endpoints for machine consumers (agent-to-agent) to query reputation data with:
- Deterministic JSON contracts with strict Zod validation
- Freshness metadata and confidence annotations in every response
- x402 payment integration for monetized endpoints
- Stable API versioning for programmatic consumers

## API Endpoints

### GET /v1/identity/reputation

Returns comprehensive reputation data for an agent.

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| agentAddress | string | Yes | - | Ethereum address (0x...) |
| chain | enum | No | base | ethereum, base, optimism, arbitrum, polygon |
| timeframe | enum | No | 30d | 24h, 7d, 30d, 90d, 1y, all |
| evidenceDepth | enum | No | standard | minimal, standard, full |

**Response:**
```json
{
  "agentAddress": "0x1234...",
  "chain": "base",
  "trustScore": 85.5,
  "completionRate": 98.2,
  "disputeRate": 1.5,
  "onchainIdentityState": {
    "registered": true,
    "agentId": "123",
    "registryAddress": "0xregistry...",
    "domain": "agent.example.com",
    "owner": "0xowner...",
    "active": true,
    "trustModels": ["feedback", "tee-attestation"]
  },
  "evidenceUrls": [
    {
      "type": "transaction",
      "url": "https://basescan.org/tx/0x...",
      "description": "Task completion",
      "timestamp": "2024-01-15T10:00:00Z"
    }
  ],
  "freshness": {
    "lastUpdated": "2024-01-15T10:30:00Z",
    "dataAge": 300,
    "nextRefresh": "2024-01-15T10:35:00Z",
    "source": "aggregated"
  },
  "confidence": {
    "level": "high",
    "score": 0.9,
    "factors": ["verified_identity", "abundant_evidence", "fresh_data"]
  }
}
```

### GET /v1/identity/history

Returns paginated history of reputation events.

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| agentAddress | string | Yes | - | Ethereum address |
| chain | enum | No | base | Target chain |
| limit | number | No | 20 | Results per page (1-100) |
| offset | number | No | 0 | Pagination offset |

**Response:**
```json
{
  "agentAddress": "0x1234...",
  "chain": "base",
  "events": [
    {
      "id": "evt_001",
      "type": "task_completed",
      "timestamp": "2024-01-15T10:00:00Z",
      "details": { "taskId": "task_123", "reward": "0.1 ETH" },
      "evidenceUrl": "https://basescan.org/tx/0x..."
    }
  ],
  "total": 150,
  "limit": 20,
  "offset": 0,
  "freshness": { ... }
}
```

### GET /v1/identity/trust-breakdown

Returns detailed breakdown of trust score components.

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| agentAddress | string | Yes | - | Ethereum address |
| chain | enum | No | base | Target chain |
| timeframe | enum | No | 30d | Analysis timeframe |

**Response:**
```json
{
  "agentAddress": "0x1234...",
  "chain": "base",
  "overallScore": 87.5,
  "components": [
    {
      "name": "Task Completion",
      "score": 95,
      "weight": 0.4,
      "description": "Historical task completion rate",
      "evidenceCount": 150
    },
    {
      "name": "Dispute Resolution",
      "score": 80,
      "weight": 0.3,
      "description": "Dispute handling track record",
      "evidenceCount": 5
    },
    {
      "name": "Peer Feedback",
      "score": 85,
      "weight": 0.3,
      "description": "Ratings from other agents",
      "evidenceCount": 45
    }
  ],
  "freshness": { ... },
  "confidence": { ... }
}
```

## Error Responses

All errors follow a consistent format:

```json
{
  "error": {
    "code": "INVALID_ADDRESS",
    "message": "The provided address is not a valid Ethereum address",
    "details": { "provided": "invalid", "expected": "0x..." }
  }
}
```

**Error Codes:**
| Code | HTTP Status | Description |
|------|-------------|-------------|
| INVALID_ADDRESS | 400 | Invalid Ethereum address format |
| INVALID_CHAIN | 400 | Unsupported chain |
| INVALID_TIMEFRAME | 400 | Invalid timeframe value |
| AGENT_NOT_FOUND | 404 | No agent found at address |
| CHAIN_UNAVAILABLE | 503 | Chain temporarily unavailable |
| RATE_LIMITED | 429 | Too many requests |
| PAYMENT_REQUIRED | 402 | x402 payment required |
| INTERNAL_ERROR | 500 | Internal server error |

## Usage

### Basic Setup

```typescript
import {
  createReputationService,
  createReputationHandlers,
  type ReputationDataSource,
} from '@lucid-agents/identity';

// Implement your data source
const dataSource: ReputationDataSource = {
  fetchIdentityState: async (agentAddress, chain) => { ... },
  fetchPerformanceMetrics: async (agentAddress, chain, timeframe) => { ... },
  fetchEvidence: async (agentAddress, chain, depth) => { ... },
  fetchHistory: async (agentAddress, chain, limit, offset) => { ... },
  fetchTrustComponents: async (agentAddress, chain, timeframe) => { ... },
};

// Create service and handlers
const service = createReputationService({
  dataSource,
  cacheTtlSeconds: 300,
  stalenessThresholdSeconds: 3600,
});

const handlers = createReputationHandlers({
  service,
  requirePayment: true,
  checkPayment: async (request) => {
    // Integrate with @lucid-agents/payments for x402
    return verifyX402Payment(request);
  },
});

// Mount handlers (example with Hono)
app.get('/v1/identity/reputation', (c) => handlers.handleReputation(c.req.raw));
app.get('/v1/identity/history', (c) => handlers.handleHistory(c.req.raw));
app.get('/v1/identity/trust-breakdown', (c) => handlers.handleTrustBreakdown(c.req.raw));
```

### With x402 Payments

```typescript
import { createReputationHandlers } from '@lucid-agents/identity';
import { verifyPayment } from '@lucid-agents/payments';

const handlers = createReputationHandlers({
  service,
  requirePayment: true,
  checkPayment: async (request) => {
    const result = await verifyPayment(request, {
      price: '0.001',
      asset: 'ETH',
      receiverAddress: process.env.RECEIVER_WALLET,
    });
    return result.verified;
  },
});
```

## Configuration

### Service Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| dataSource | ReputationDataSource | required | Data fetching implementation |
| cacheTtlSeconds | number | 300 | Cache TTL for freshness metadata |
| stalenessThresholdSeconds | number | 3600 | Threshold for confidence calculation |

### Handler Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| service | ReputationService | required | Service instance |
| requirePayment | boolean | false | Enable x402 payment requirement |
| checkPayment | function | undefined | Payment verification callback |

## Trust Score Calculation

The trust score (0-100) is calculated from weighted components:

| Component | Weight | Description |
|-----------|--------|-------------|
| Completion Rate | 40% | Historical task completion percentage |
| Dispute Rate | 30% | Inverse of dispute frequency |
| Identity Verification | 20% | ERC-8004 registration + active status |
| History Length | 10% | Capped at 100 events |

## Confidence Levels

Confidence annotations indicate data reliability:

| Level | Score Range | Criteria |
|-------|-------------|----------|
| High | 0.8 - 1.0 | Fresh data, abundant evidence, verified identity |
| Medium | 0.5 - 0.8 | Recent data, sufficient evidence |
| Low | 0.0 - 0.5 | Stale data, limited evidence |

## Architecture

This module integrates with the Lucid Agents ecosystem:

- **Runtime**: `@lucid-agents/core`
- **Transport**: `@lucid-agents/http`
- **Payments**: `@lucid-agents/payments` (x402)
- **Wallet**: `@lucid-agents/wallet`
- **Identity**: `@lucid-agents/identity`
- **A2A**: `@lucid-agents/a2a`

## License

MIT
