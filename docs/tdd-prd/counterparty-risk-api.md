# TDD PRD: Counterparty Risk Graph Intelligence API

Status: Draft
Issue: #179
Bounty: $3
Owner: @dagangtj
Last Updated: 2026-02-26

## Summary

Build a paid graph-intelligence API that sells wallet/entity clustering, exposure paths, and risk scores for payment and underwriting agents.

## Problem

Payment and underwriting agents lack standardized machine-readable counterparty risk context before transacting. They cannot efficiently assess exposure chains or sanctions proximity.

## Goals

- Provide risk scores with explainable risk factors
- Expose wallet/entity clustering and exposure paths
- Deliver sanctions proximity analysis
- Enforce payment via x402 on all monetized endpoints
- Guarantee P95 response time ≤500ms for cached paths

## Non-Goals

- Building blockchain indexing infrastructure
- Real-time transaction monitoring
- Compliance reporting UI

## User Stories

### Agent-to-Agent

As a payment-routing agent, I need exposure-chain and risk evidence in one response so I can avoid high-risk counterparties automatically.

## API Contract (v1)

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/risk/score` | Calculate risk score for address |
| GET | `/v1/risk/exposure-paths` | Get exposure path analysis |
| GET | `/v1/risk/entity-profile` | Get entity cluster profile |

### Request Schema

```typescript
// POST /v1/risk/score
interface RiskScoreRequest {
  address: string;           // Required: wallet/contract address
  network: string;           // Required: blockchain network
  transactionContext?: {
    amount?: number;
    counterparty?: string;
  };
  threshold?: number;        // Risk threshold (0-1)
  lookbackDays?: number;     // Historical lookback (default: 90)
}

// GET /v1/risk/exposure-paths
interface ExposurePathsRequest {
  address: string;
  network: string;
  maxDepth?: number;         // Max graph traversal depth (default: 3)
  includeIndirect?: boolean; // Include indirect exposures
}

// GET /v1/risk/entity-profile
interface EntityProfileRequest {
  address: string;
  network: string;
  includeRelated?: boolean;  // Include related addresses
}
```

### Response Schema

```typescript
// POST /v1/risk/score
interface RiskScoreResponse {
  address: string;
  network: string;
  riskScore: number;         // 0-1 normalized risk
  riskFactors: Array<{
    factor: string;
    weight: number;
    evidence: string;
  }>;
  sanctionsProximity: number; // Hops to sanctioned entity
  clusterId?: string;
  confidence: number;
  freshnessMs: number;
  updatedAt: string;
}

// GET /v1/risk/exposure-paths
interface ExposurePathsResponse {
  address: string;
  exposurePaths: Array<{
    pathId: string;
    hops: Array<{
      address: string;
      label?: string;
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
    }>;
    totalRisk: number;
    pathType: 'direct' | 'indirect';
  }>;
  evidenceRefs: string[];
  freshnessMs: number;
}

// GET /v1/risk/entity-profile
interface EntityProfileResponse {
  address: string;
  clusterId: string;
  clusterSize: number;
  entityType: 'individual' | 'exchange' | 'defi' | 'mixer' | 'unknown';
  relatedAddresses: string[];
  activitySummary: {
    totalTransactions: number;
    totalVolume: number;
    firstSeen: string;
    lastSeen: string;
  };
  freshnessMs: number;
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_ADDRESS` | 400 | Invalid address format |
| `UNSUPPORTED_NETWORK` | 400 | Network not supported |
| `ADDRESS_NOT_FOUND` | 404 | No data for address |
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
describe('Risk Score Schema', () => {
  it('should validate valid score request');
  it('should reject invalid address format');
  it('should reject unsupported network');
  it('should validate risk factors array');
  it('should include sanctions proximity');
});

describe('Exposure Paths Schema', () => {
  it('should validate paths array structure');
  it('should validate hop structure');
  it('should include evidence refs');
});

describe('Entity Profile Schema', () => {
  it('should validate entity type enum');
  it('should validate activity summary');
  it('should include cluster information');
});
```

### Phase 2: Business Logic Tests

```typescript
describe('Risk Scoring', () => {
  it('should calculate composite risk from factors');
  it('should weight factors appropriately');
  it('should normalize to 0-1 range');
  it('should handle missing data gracefully');
});

describe('Graph Traversal', () => {
  it('should find shortest path to risk');
  it('should respect max depth limit');
  it('should detect cycles');
  it('should aggregate path risk');
});

describe('Entity Clustering', () => {
  it('should identify related addresses');
  it('should classify entity types');
  it('should compute cluster metrics');
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
  it('should return risk score after payment');
  it('should return exposure paths after payment');
  it('should return entity profile after payment');
});
```

### Phase 4: Freshness/Quality Tests

```typescript
describe('Data Freshness', () => {
  it('should include freshnessMs in all responses');
  it('should reject stale graph data');
});

describe('False Positive Guards', () => {
  it('should not flag known-safe addresses');
  it('should require minimum evidence threshold');
});
```

## Test Coverage Requirements

| Type | Target | Focus |
|------|--------|-------|
| Unit | 90% | Graph traversal, scoring, clustering |
| Integration | 80% | Endpoints + payment + A2A |
| Contract | 100% | JSON shape, error codes |

## Acceptance Criteria

- [ ] All monetized endpoints require payment
- [ ] All responses include freshness and confidence
- [ ] P95 response time ≤500ms for cached path
- [ ] Test suite passes in CI
- [ ] README includes endpoint examples

## Definition of Done

- [ ] PR opened referencing issue #179
- [ ] CI green with test evidence
- [ ] Reviewer confirms TDD order

## TaskMarket Cross-Reference

- TaskMarket Task ID: `0x2d5b5d7d419c76537b2edbcf7e54a51ae7d07bc7a428cf8b0b1d62fe8d33ea4c`
- TaskMarket API URL: https://api-market.daydreams.systems/api/tasks/0x2d5b5d7d419c76537b2edbcf7e54a51ae7d07bc7a428cf8b0b1d62fe8d33ea4c
