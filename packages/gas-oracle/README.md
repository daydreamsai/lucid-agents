# @lucid-agents/gas-oracle

Real-time gas and inclusion probability oracle API for blockchain networks.

## Features

- **Gas Quote API**: Get fee recommendations with inclusion probability curves
- **Gas Forecast API**: Predict future gas prices for upcoming blocks
- **Congestion Monitoring**: Real-time network congestion state and trends
- **Multi-Chain Support**: Ethereum, Base, Arbitrum, Optimism, Polygon
- **TDD Implementation**: Comprehensive test coverage with contract, unit, and integration tests
- **Type-Safe**: Full TypeScript support with Zod schema validation
- **Lucid Agents Integration**: Built on @lucid-agents/core with payment support

## Installation

```bash
bun add @lucid-agents/gas-oracle
```

## Quick Start

```typescript
import { createGasOracleAPI, ViemGasDataProvider } from '@lucid-agents/gas-oracle';

// Create provider
const provider = new ViemGasDataProvider({
  ethereum: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY',
});

// Create API
const app = createGasOracleAPI(provider);

// Start server
export default {
  port: 3000,
  fetch: app.fetch,
};
```

## API Endpoints

### GET /v1/gas/quote

Get gas fee recommendation with inclusion probability.

**Query Parameters:**
- `chain` (required): `ethereum` | `base` | `arbitrum` | `optimism` | `polygon`
- `urgency` (optional): `low` | `medium` | `high` | `urgent` (default: `medium`)
- `txType` (optional): `transfer` | `swap` | `contract` (default: `transfer`)
- `recentFailureTolerance` (optional): number 0-1 (default: `0.05`)

**Example:**
```bash
curl "http://localhost:3000/v1/gas/quote?chain=ethereum&urgency=high"
```

**Response:**
```json
{
  "recommended_max_fee": "50000000000",
  "priority_fee": "2600000000",
  "inclusion_probability_curve": [
    { "blocks": 1, "probability": 0.75 },
    { "blocks": 2, "probability": 0.92 },
    { "blocks": 3, "probability": 0.98 }
  ],
  "congestion_state": "moderate",
  "confidence_score": 0.85,
  "freshness_ms": 1500,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### GET /v1/gas/forecast

Forecast gas prices for future blocks.

**Query Parameters:**
- `chain` (required): blockchain network
- `targetBlocks` (optional): number of blocks to forecast (default: `10`)

**Example:**
```bash
curl "http://localhost:3000/v1/gas/forecast?chain=ethereum&targetBlocks=5"
```

**Response:**
```json
{
  "chain": "ethereum",
  "current_block": 18000000,
  "forecast": [
    {
      "block_offset": 0,
      "estimated_base_fee": "30000000000",
      "estimated_priority_fee": "1500000000",
      "confidence": 0.95
    }
  ],
  "freshness_ms": 2000,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### GET /v1/gas/congestion

Get current network congestion state.

**Query Parameters:**
- `chain` (required): blockchain network

**Example:**
```bash
curl "http://localhost:3000/v1/gas/congestion?chain=ethereum"
```

**Response:**
```json
{
  "chain": "ethereum",
  "congestion_state": "high",
  "pending_tx_count": 15000,
  "avg_block_utilization": 0.85,
  "base_fee_trend": "rising",
  "freshness_ms": 1000,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Usage with Lucid Agents

```typescript
import { createGasOracleAPI, ViemGasDataProvider } from '@lucid-agents/gas-oracle';
import { paymentRequired } from '@lucid-agents/payments';

const provider = new ViemGasDataProvider();
const app = createGasOracleAPI(provider);

// Add payment middleware to monetize endpoints
app.use('/v1/gas/*', paymentRequired({
  amount: '1000000', // 0.001 USDC
  currency: 'USDC',
  network: 'base',
}));

export default app;
```

## Testing

```bash
# Run all tests
bun test

# Run specific test suite
bun test src/__tests__/schemas.test.ts
bun test src/__tests__/core.test.ts
bun test src/__tests__/service.test.ts
bun test src/__tests__/api.test.ts
```

## Architecture

- **Schemas** (`schemas.ts`): Zod schemas for request/response validation
- **Core** (`core.ts`): Business logic for fee calculation and probability modeling
- **Provider** (`provider.ts`): Data providers (Mock for testing, Viem for production)
- **Service** (`service.ts`): Orchestration layer combining core logic and data providers
- **API** (`api.ts`): Hono HTTP endpoints with error handling

## TDD Approach

This package was built following Test-Driven Development:

1. ✅ Contract tests for all schemas and error envelopes
2. ✅ Unit tests for core business logic (fee calculation, probability curves)
3. ✅ Integration tests for service layer
4. ✅ API endpoint tests with error handling
5. ✅ Performance tests (P95 < 500ms for cached paths)

## Configuration

### Custom RPC Endpoints

```typescript
const provider = new ViemGasDataProvider({
  ethereum: 'https://your-rpc.example.com',
  base: 'https://base-rpc.example.com',
});
```

### Mock Provider for Testing

```typescript
import { MockGasDataProvider } from '@lucid-agents/gas-oracle';

const provider = new MockGasDataProvider();
provider.setMockData('baseFee:ethereum', BigInt(50e9));
provider.setMockData('utilization:ethereum', 0.85);
```

## License

MIT
