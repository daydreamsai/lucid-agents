# TDD PRD: Real-Time Gas & Inclusion Probability Oracle

Status: Draft
Issue: #178
Bounty: $3
Owner: @dagangtj
Last Updated: 2026-02-26

## Summary

Build a paid API that sells chain-specific fee recommendations with inclusion probability by latency target for execution agents.

## Problem

Execution agents must guess gas settings, causing failed transactions and unnecessary spend. They need fee recommendations tied to explicit inclusion probability for cost vs. latency optimization.

## Goals

- Provide gas quotes with inclusion probability curves
- Expose congestion state and forecasts
- Deliver chain-specific fee recommendations
- Enforce payment via x402 on all monetized endpoints
- Guarantee P95 response time ≤500ms for cached paths

## Non-Goals

- Transaction submission or relay
- Historical gas analytics dashboard
- Cross-chain bridging optimization

## User Stories

### Agent-to-Agent

As a settlement agent, I need fee recommendations tied to explicit inclusion probability so I can optimize for cost vs. latency programmatically.

## API Contract (v1)

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/gas/quote` | Get gas price recommendation |
| GET | `/v1/gas/forecast` | Get gas price forecast |
| GET | `/v1/gas/congestion` | Get network congestion state |

### Request Schema

```typescript
// GET /v1/gas/quote
interface GasQuoteRequest {
  chain: string;             // Required: chain identifier
  urgency: 'low' | 'medium' | 'high' | 'urgent';
  targetBlocks?: number;     // Target inclusion within N blocks
  txType?: 'legacy' | 'eip1559' | 'eip4844';
  recentFailureTolerance?: number; // Acceptable failure rate (0-1)
}

// GET /v1/gas/forecast
interface GasForecastRequest {
  chain: string;
  horizonBlocks: number;     // Forecast horizon in blocks
  percentiles?: number[];    // e.g., [25, 50, 75, 95]
}

// GET /v1/gas/congestion
interface CongestionRequest {
  chain: string;
  includeHistory?: boolean;  // Include recent history
  historyBlocks?: number;    // Blocks of history (default: 100)
}
```

### Response Schema

```typescript
// GET /v1/gas/quote
interface GasQuoteResponse {
  chain: string;
  recommendedMaxFee: string;      // Wei as string
  recommendedPriorityFee: string; // Wei as string
  inclusionProbabilityCurve: Array<{
    blocks: number;
    probability: number;
  }>;
  confidenceScore: number;
  baseFee: string;
  freshnessMs: number;
  updatedAt: string;
}

// GET /v1/gas/forecast
interface GasForecastResponse {
  chain: string;
  forecasts: Array<{
    blockOffset: number;
    percentiles: Record<number, string>; // percentile -> wei
    confidence: number;
  }>;
  trend: 'rising' | 'stable' | 'falling';
  freshnessMs: number;
}

// GET /v1/gas/congestion
interface CongestionResponse {
  chain: string;
  congestionState: 'low' | 'normal' | 'elevated' | 'high' | 'critical';
  utilizationPercent: number;
  pendingTxCount: number;
  avgBlockTime: number;
  history?: Array<{
    blockNumber: number;
    baseFee: string;
    utilization: number;
  }>;
  freshnessMs: number;
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNSUPPORTED_CHAIN` | 400 | Chain not supported |
| `INVALID_URGENCY` | 400 | Invalid urgency level |
| `PAYMENT_REQUIRED` | 402 | x402 payment not provided |
| `CHAIN_UNAVAILABLE` | 503 | Chain data temporarily unavailable |
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
describe('Gas Quote Schema', () => {
  it('should validate valid quote request');
  it('should reject unsupported chain');
  it('should reject invalid urgency');
  it('should validate inclusion probability curve');
  it('should return wei as strings');
});

describe('Gas Forecast Schema', () => {
  it('should validate forecast array structure');
  it('should validate percentile keys');
  it('should include trend indicator');
});

describe('Congestion Schema', () => {
  it('should validate congestion state enum');
  it('should validate utilization percentage range');
  it('should include optional history');
});
```

### Phase 2: Business Logic Tests

```typescript
describe('Fee Calculation', () => {
  it('should calculate max fee from base + priority');
  it('should adjust for urgency level');
  it('should handle EIP-1559 vs legacy');
  it('should factor in recent failures');
});

describe('Inclusion Probability', () => {
  it('should be monotonically increasing with blocks');
  it('should reach 1.0 at sufficient blocks');
  it('should calibrate against historical data');
});

describe('Congestion Detection', () => {
  it('should classify congestion levels correctly');
  it('should calculate utilization accurately');
  it('should detect trend changes');
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
  it('should return quote after payment');
  it('should return forecast after payment');
  it('should return congestion after payment');
});
```

### Phase 4: Freshness/Quality Tests

```typescript
describe('Data Freshness', () => {
  it('should include freshnessMs in all responses');
  it('should reject stale block data');
});

describe('Forecast Monotonicity', () => {
  it('should maintain probability monotonicity');
  it('should bound percentiles correctly');
});

describe('Fallback Logic', () => {
  it('should fallback to safe defaults on RPC failure');
  it('should indicate reduced confidence');
});
```

## Test Coverage Requirements

| Type | Target | Focus |
|------|--------|-------|
| Unit | 90% | Fee calculation, probability, congestion |
| Integration | 80% | Endpoints + payment + A2A |
| Contract | 100% | JSON shape, error codes |

## Acceptance Criteria

- [ ] All monetized endpoints require payment
- [ ] All responses include freshness and confidence
- [ ] P95 response time ≤500ms for cached path
- [ ] Test suite passes in CI
- [ ] README includes endpoint examples

## Definition of Done

- [ ] PR opened referencing issue #178
- [ ] CI green with test evidence
- [ ] Reviewer confirms TDD order

## TaskMarket Cross-Reference

- TaskMarket Task ID: `0xfa39926bffd839fe742a76772fda159b649f88c82d303abb045edea545818815`
- TaskMarket API URL: https://api-market.daydreams.systems/api/tasks/0xfa39926bffd839fe742a76772fda159b649f88c82d303abb045edea545818815
