# @lucid-agents/liquidity-api

Cross-chain liquidity snapshot service with paid API endpoints (x402).

## Overview

A paid API-first Lucid agent that sells minute-level liquidity depth, slippage curves, and route quality for major token pairs across EVM venues.

## Endpoints

| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /entrypoints/snapshot/invoke` | $0.10 | Liquidity snapshot with pool depth and TVL |
| `POST /entrypoints/slippage/invoke` | $0.15 | Slippage curve by notional size |
| `POST /entrypoints/routes/invoke` | $0.20 | Best execution routes ranked by total cost |

## Quick Start

```bash
# Install dependencies
bun install

# Run the agent
bun run packages/liquidity-api/src/index.ts

# Or with environment variables
WALLET_ADDRESS=0x... PORT=3000 bun run packages/liquidity-api/src/index.ts
```

## API Contract (v1)

### GET /v1/liquidity/snapshot

Request:
```json
{
  "chain": "ethereum",
  "baseToken": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  "quoteToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "venueFilter": ["uniswap-v3", "curve"]
}
```

Response:
```json
{
  "pools": [
    {
      "venue": "uniswap-v3",
      "address": "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640",
      "baseToken": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      "quoteToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "tvlUsd": 150000000,
      "depthBuckets": [
        { "notionalUsd": 1000, "liquidityUsd": 50000 },
        { "notionalUsd": 10000, "liquidityUsd": 500000 }
      ]
    }
  ],
  "freshness_ms": 5000,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### GET /v1/liquidity/slippage

Request:
```json
{
  "chain": "ethereum",
  "baseToken": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  "quoteToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "notionalUsd": 50000
}
```

Response:
```json
{
  "slippage_bps_curve": [
    { "notionalUsd": 1000, "slippageBps": 5 },
    { "notionalUsd": 10000, "slippageBps": 25 },
    { "notionalUsd": 50000, "slippageBps": 50 }
  ],
  "confidence_score": 0.95,
  "freshness_ms": 3000,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### GET /v1/liquidity/routes

Request:
```json
{
  "chain": "ethereum",
  "baseToken": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  "quoteToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "notionalUsd": 25000
}
```

Response:
```json
{
  "best_route": {
    "path": ["uniswap-v3"],
    "estimatedSlippageBps": 25,
    "estimatedGasUsd": 15,
    "totalCostBps": 40,
    "confidence_score": 0.95
  },
  "alternatives": [
    {
      "path": ["curve"],
      "estimatedSlippageBps": 30,
      "estimatedGasUsd": 12,
      "totalCostBps": 42,
      "confidence_score": 0.92
    }
  ],
  "freshness_ms": 4000,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Supported Chains

- Ethereum
- Arbitrum
- Optimism
- Polygon
- Base
- BSC

## Supported Venues

- Uniswap V2/V3
- SushiSwap
- Curve
- Balancer
- PancakeSwap

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `WALLET_ADDRESS` | Receivables wallet address | Hardhat account #1 |
| `NETWORK` | EIP-155 network identifier | `eip155:84532` |
| `FACILITATOR_URL` | x402 facilitator URL | `https://facilitator.daydreams.systems` |
| `PORT` | Server port | `3000` |

## Architecture

Built with Lucid Agents SDK packages:
- `@lucid-agents/core` - Runtime
- `@lucid-agents/http` - Transport + SSE
- `@lucid-agents/payments` - x402 paywall + pricing
- `@lucid-agents/hono` - Hono adapter

## Testing

```bash
bun test packages/liquidity-api
```

## License

MIT
