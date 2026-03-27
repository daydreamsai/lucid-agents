# @lucid-agents/identity-api

ERC-8004 Identity Reputation Signal API - A paid identity data API that sells agent trust/reputation signals from ERC-8004 plus verified offchain performance evidence.

## Overview

This package provides HTTP endpoints for querying agent reputation, history, and trust breakdowns. Built with TDD principles and designed for agent-to-agent consumption.

## Features

- **Reputation Scoring**: Get comprehensive trust scores based on onchain and offchain data
- **History Tracking**: Query agent interaction history with evidence links
- **Trust Breakdown**: Detailed component analysis of trust scores
- **Payment Support**: Optional x402 payment middleware for monetized endpoints
- **Freshness Metadata**: All responses include data age and confidence scores
- **Strict Validation**: Zod-based schema validation for all inputs/outputs

## Installation

```bash
bun add @lucid-agents/identity-api
```

## Quick Start

```typescript
import { createIdentityAPI } from '@lucid-agents/identity-api';
import { createIdentityRegistryClient } from '@lucid-agents/identity';
import { createReputationRegistryClient } from '@lucid-agents/identity';

// Create registry clients
const identityClient = createIdentityRegistryClient({
  address: '0x...',
  chainId: 84532,
  publicClient,
  walletClient,
});

const reputationClient = createReputationRegistryClient({
  address: '0x...',
  chainId: 84532,
  publicClient,
  walletClient,
  identityRegistryAddress: '0x...',
});

// Create API
const app = createIdentityAPI({
  identityClient,
  reputationClient,
  enablePayments: false, // Set to true for paid access
});

// Start server
Bun.serve({
  port: 3000,
  fetch: app.fetch,
});
```

## API Endpoints

### GET /v1/identity/reputation

Get reputation score and metrics for an agent.

**Query Parameters:**
- `agentAddress` (required): Ethereum address (0x-prefixed)
- `chain` (required): Chain identifier (e.g., `eip155:84532`)
- `timeframe` (optional): Time window for analysis (e.g., `30d`)
- `evidenceDepth` (optional): Level of evidence detail (`minimal`, `standard`, `full`)

**Response:**
```json
{
  "trust_score": 85.5,
  "completion_rate": 0.95,
  "dispute_rate": 0.02,
  "onchain_identity_state": {
    "agentId": "42",
    "owner": "0x1234...",
    "registered": true
  },
  "evidence_urls": ["https://..."],
  "freshness": {
    "timestamp": "2024-02-27T12:00:00Z",
    "age_seconds": 120
  },
  "confidence": 0.9
}
```

**Example:**
```bash
curl "http://localhost:3000/v1/identity/reputation?agentAddress=0x1234567890123456789012345678901234567890&chain=eip155:84532"
```

### GET /v1/identity/history

Get interaction history for an agent.

**Query Parameters:**
- `agentAddress` (required): Ethereum address
- `chain` (required): Chain identifier
- `limit` (optional): Max events to return (1-100, default: 20)
- `offset` (optional): Pagination offset (default: 0)
- `evidenceDepth` (optional): Evidence detail level

**Response:**
```json
{
  "events": [
    {
      "type": "feedback",
      "timestamp": "2024-02-27T12:00:00Z",
      "from": "0x5678...",
      "value": 90,
      "evidence_url": "https://...",
      "metadata": {
        "tag1": "reliable",
        "tag2": "fast"
      }
    }
  ],
  "total_count": 42,
  "freshness": {
    "timestamp": "2024-02-27T12:00:00Z",
    "age_seconds": 60
  }
}
```

**Example:**
```bash
curl "http://localhost:3000/v1/identity/history?agentAddress=0x1234567890123456789012345678901234567890&chain=eip155:84532&limit=10"
```

### GET /v1/identity/trust-breakdown

Get detailed breakdown of trust score components.

**Query Parameters:**
- `agentAddress` (required): Ethereum address
- `chain` (required): Chain identifier

**Response:**
```json
{
  "components": {
    "onchain_reputation": 80,
    "completion_history": 90,
    "dispute_resolution": 85,
    "peer_endorsements": 75
  },
  "weights": {
    "onchain_reputation": 0.4,
    "completion_history": 0.3,
    "dispute_resolution": 0.2,
    "peer_endorsements": 0.1
  },
  "overall_score": 82.5,
  "freshness": {
    "timestamp": "2024-02-27T12:00:00Z",
    "age_seconds": 30
  },
  "confidence": 0.95
}
```

**Example:**
```bash
curl "http://localhost:3000/v1/identity/trust-breakdown?agentAddress=0x1234567890123456789012345678901234567890&chain=eip155:84532"
```

## Error Responses

All errors follow a consistent format:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Invalid request parameters",
    "details": { ... }
  }
}
```

**Error Codes:**
- `INVALID_REQUEST`: Invalid input parameters
- `CHAIN_MISMATCH`: Unsupported chain
- `INTERNAL_ERROR`: Server error

## Payment Configuration

Enable paid access with x402 middleware:

```typescript
const app = createIdentityAPI({
  identityClient,
  reputationClient,
  enablePayments: true,
  paymentConfig: {
    payTo: '0xYourWalletAddress',
    facilitatorUrl: 'https://facilitator.daydreams.systems',
    network: 'eip155:84532',
  },
});
```

When payments are enabled, clients must include payment proof in requests.

## Freshness and Confidence

All responses include freshness metadata:

- **timestamp**: ISO 8601 timestamp of data snapshot
- **age_seconds**: Age of data in seconds
- **confidence**: Confidence score (0-1) based on sample size and freshness

Confidence calculation:
- Higher sample counts increase confidence (logarithmic scale)
- Fresher data increases confidence (exponential decay, 1-hour half-life)

## Supported Networks

- Base Sepolia (84532) - default testnet
- Base Mainnet (8453)
- Ethereum Mainnet (1)
- Ethereum Sepolia (11155111)
- Arbitrum (42161)
- Optimism (10)
- Polygon (137)

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Build
bun run build

# Type check
bun run type-check
```

## Testing

The package follows TDD principles with comprehensive test coverage:

1. **Contract Tests** (`schemas.test.ts`): Validate all request/response schemas
2. **Business Logic Tests** (`scoring.test.ts`): Test scoring algorithms and data transforms
3. **Integration Tests** (`integration.test.ts`): Test endpoint handlers and error handling
4. **Payment Tests** (`payments.test.ts`): Test x402 payment middleware

Run tests:
```bash
bun test
```

## Architecture

Built with:
- **@lucid-agents/core**: Agent runtime
- **@lucid-agents/http**: HTTP transport
- **@lucid-agents/payments**: x402 payment middleware
- **@lucid-agents/identity**: ERC-8004 registry clients
- **Hono**: Fast web framework
- **Zod**: Schema validation

## Performance

- P95 response time: <500ms (cached path)
- Freshness tracking for cache invalidation
- Confidence scoring for data quality

## License

MIT

## Links

- [ERC-8004 Specification](https://eips.ethereum.org/EIPS/eip-8004)
- [Lucid Agents Documentation](https://github.com/daydreamsai/lucid-agents)
- [Issue #183](https://github.com/daydreamsai/lucid-agents/issues/183)
