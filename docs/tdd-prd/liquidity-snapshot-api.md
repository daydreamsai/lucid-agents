# TDD PRD: Cross-Chain Liquidity Snapshot Service

Status: Draft
Issue: #177
Bounty: $3
Owner: @dagangtj
Last Updated: 2026-02-26

## Summary

Build a paid API-first Lucid agent that sells minute-level liquidity depth, slippage curves, and route quality for major token pairs across EVM venues.

## Problem

Execution agents overpay or fail routes because they cannot buy normalized, machine-readable liquidity snapshots with predictable latency and data quality guarantees.

## Goals

- Provide normalized pool depth across venues
- Expose slippage curves by notional size
- Deliver best route recommendations
- Enforce payment via x402 on all monetized endpoints
- Guarantee P95 response time ≤500ms for cached paths

## Non-Goals

- Trade execution or routing
- Real-time order book streaming
- DEX aggregator functionality

## User Stories

### Agent-to-Agent

As a routing agent, I need a single paid endpoint that returns comparable pool depth and estimated slippage by notional so I can select the cheapest executable route automatically.

## API Contract (v1)

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/liquidity/snapshot` | Get liquidity snapshot for pair |
| GET | `/v1/liquidity/slippage` | Get slippage curve for trade size |
| GET | `/v1/liquidity/routes` | Get ranked route options |

### Request Schema

```typescript
// GET /v1/liquidity/snapshot
interface LiquiditySnapshotRequest {
  chain: string;             // Required: chain identifier
  baseToken: string;         // Required: base token address
  quoteToken: string;        // Required: quote token address
  venueFilter?: string[];    // Optional: filter by venues
  timestamp?: string;        // Optional: historical snapshot
}

// GET /v1/liquidity/slippage
interface SlippageRequest {
  chain: string;
  baseToken: string;
  quoteToken: string;
  notionalUsd: number;       // Required: trade size in USD
  side: 'buy' | 'sell';
}

// GET /v1/liquidity/routes
interface RoutesRequest {
  chain: string;
  baseToken: string;
  quoteToken: string;
  notionalUsd: number;
  maxHops?: number;          // Max routing hops (default: 3)
  maxRoutes?: number;        // Max routes to return (default: 5)
}
```

### Response Schema

```typescript
// GET /v1/liquidity/snapshot
interface LiquiditySnapshotResponse {
  chain: string;
  baseToken: string;
  quoteToken: string;
  pools: Array<{
    venue: string;
    poolAddress: string;
    liquidity: {
      baseAmount: string;
      quoteAmount: string;
      tvlUsd: number;
    };
    fee: number;             // Fee in basis points
    lastTradeAt: string;
  }>;
  aggregatedDepth: {
    totalTvlUsd: number;
    weightedFee: number;
  };
  freshnessMs: number;
  updatedAt: string;
}

// GET /v1/liquidity/slippage
interface SlippageResponse {
  chain: string;
  baseToken: string;
  quoteToken: string;
  notionalUsd: number;
  slippageBpsCurve: Array<{
    notionalUsd: number;
    slippageBps: number;
    confidence: number;
  }>;
  estimatedSlippageBps: number;
  priceImpactPercent: number;
  freshnessMs: number;
}

// GET /v1/liquidity/routes
interface RoutesResponse {
  chain: string;
  baseToken: string;
  quoteToken: string;
  routes: Array<{
    routeId: string;
    hops: Array<{
      venue: string;
      poolAddress: string;
      tokenIn: string;
      tokenOut: string;
      fee: number;
    }>;
    estimatedOutput: string;
    totalSlippageBps: number;
    totalFeeBps: number;
    score: number;           // 0-1 route quality score
  }>;
  bestRoute: string;         // routeId of recommended route
  confidenceScore: number;
  freshnessMs: number;
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNSUPPORTED_CHAIN` | 400 | Chain not supported |
| `INVALID_TOKEN` | 400 | Token address invalid |
| `PAIR_NOT_FOUND` | 404 | No liquidity for pair |
| `PAYMENT_REQUIRED` | 402 | x402 payment not provided |
| `INTERNAL_ERROR` | 500 | Internal server error |

## Architecture Requirements

### Lucid Packages

| Package | Purpose |
|---------|---------|
| `@lucid-agents/core` | Runtime and agent lifecycle |
| `@lucid-agents/http` | Transport + SSE streaming |
| `@lucid-agents/payments` | x402 paywall + pricing |
| `@lucid-agents/wallet` | Receivables wallet |
| `@lucid-agents/identity` | Trust & attestations |
| `@lucid-agents/a2a` | Upstream agent federation |
| `@lucid-agents/ap2` | Revenue sharing |

## TDD Plan (Required Sequence)

### Phase 1: Contract Tests

```typescript
describe('Liquidity Snapshot Schema', () => {
  it('should validate valid snapshot request');
  it('should reject invalid token address');
  it('should validate pools array structure');
  it('should include aggregated depth');
});

describe('Slippage Schema', () => {
  it('should validate slippage curve array');
  it('should validate side enum');
  it('should include price impact');
});

describe('Routes Schema', () => {
  it('should validate routes array structure');
  it('should validate hops structure');
  it('should include best route reference');
  it('should validate score range 0-1');
});
```

### Phase 2: Business Logic Tests

```typescript
describe('Liquidity Aggregation', () => {
  it('should normalize pool data across venues');
  it('should calculate weighted fees');
  it('should aggregate TVL correctly');
});

describe('Slippage Calculation', () => {
  it('should calculate slippage from depth');
  it('should generate monotonic slippage curve');
  it('should estimate price impact');
});

describe('Route Ranking', () => {
  it('should find valid routes within hop limit');
  it('should score routes by output/cost');
  it('should handle multi-hop routes');
  it('should select best route correctly');
});
```

### Phase 3: Integration Tests

```typescript
describe('Payment Middleware', () => {
  it('should return 402 when no payment header');
  it('should process request when payment valid');
  it('should track payment in receivables wallet');
});

describe('Endpoint Integration', () => {
  it('should return snapshot after payment');
  it('should return slippage after payment');
  it('should return routes after payment');
});
```

### Phase 4: Freshness/Quality Tests

```typescript
describe('Data Freshness', () => {
  it('should include freshnessMs in all responses');
  it('should reject stale pool data');
});

describe('Stale Data Rejection', () => {
  it('should flag pools with old lastTradeAt');
  it('should reduce confidence for stale data');
});

describe('SSE Updates', () => {
  it('should stream incremental updates');
  it('should maintain consistency during updates');
});
```

## Test Coverage Requirements

| Type | Target | Focus |
|------|--------|-------|
| Unit | 90% | Aggregation, slippage, routing |
| Integration | 80% | Endpoints + payment + A2A |
| Contract | 100% | JSON shape, error codes |

## Acceptance Criteria

- [ ] All monetized endpoints require payment
- [ ] All responses include freshness and confidence
- [ ] P95 response time ≤500ms for cached path
- [ ] Test suite passes in CI
- [ ] README includes endpoint examples

## Definition of Done

- [ ] PR opened referencing issue #177
- [ ] CI green with test evidence
- [ ] Reviewer confirms TDD order

## TaskMarket Cross-Reference

- TaskMarket Task ID: `0x0cf736810fb343205481947628aee4fd718ea70d065207fc767de5898e98751f`
- TaskMarket API URL: https://api-market.daydreams.systems/api/tasks/0x0cf736810fb343205481947628aee4fd718ea70d065207fc767de5898e98751f
