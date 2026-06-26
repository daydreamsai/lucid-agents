# TDD PRD: Supplier Reliability Signal Marketplace API

Status: Draft
Issue: #181
Bounty: $3
Owner: @dagangtj
Last Updated: 2026-02-26

## Summary

Build a paid supplier-intelligence API selling lead-time drift, fill-rate risk, and disruption probability for procurement agents.

## Problem

Procurement agents cannot consistently compare supplier reliability across regions and product categories. They lack standardized, machine-readable signals with confidence bands and freshness guarantees.

## Goals

- Provide normalized supplier reliability scores with confidence intervals
- Expose lead-time forecasts with P50/P95 distributions
- Deliver disruption alerts with explainable reasons
- Enforce payment via x402 on all monetized endpoints
- Guarantee P95 response time ≤500ms for cached paths

## Non-Goals

- Building supplier onboarding UI
- Implementing supplier data ingestion pipelines
- Real-time supply chain tracking

## User Stories

### Agent-to-Agent

As a sourcing agent, I need normalized reliability signals and confidence bands to choose resilient suppliers under constraints.

### Integration

As a procurement system, I need programmatic access to supplier risk data with stable API versioning.

## API Contract (v1)

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/suppliers/score` | Get supplier reliability score |
| GET | `/v1/suppliers/lead-time-forecast` | Get lead-time P50/P95 forecast |
| GET | `/v1/suppliers/disruption-alerts` | Get active disruption alerts |

### Request Schema

```typescript
// GET /v1/suppliers/score
interface SupplierScoreRequest {
  supplierId: string;        // Required: unique supplier identifier
  category?: string;         // Optional: product category filter
  region?: string;           // Optional: geographic region
  horizonDays?: number;      // Optional: forecast horizon (default: 30)
  riskTolerance?: 'low' | 'medium' | 'high'; // Optional: risk threshold
}

// GET /v1/suppliers/lead-time-forecast
interface LeadTimeForecastRequest {
  supplierId: string;
  category?: string;
  region?: string;
  horizonDays?: number;      // Default: 30
}

// GET /v1/suppliers/disruption-alerts
interface DisruptionAlertsRequest {
  supplierId?: string;       // Optional: filter by supplier
  category?: string;
  region?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}
```

### Response Schema

```typescript
// GET /v1/suppliers/score
interface SupplierScoreResponse {
  supplierId: string;
  supplierScore: number;     // 0-100 normalized score
  confidence: number;        // 0-1 confidence level
  components: {
    fillRate: number;        // Historical fill rate
    onTimeDelivery: number;  // On-time delivery rate
    qualityScore: number;    // Quality metrics
    financialHealth: number; // Financial stability
  };
  freshnessMs: number;       // Data freshness in milliseconds
  updatedAt: string;         // ISO 8601 timestamp
}

// GET /v1/suppliers/lead-time-forecast
interface LeadTimeForecastResponse {
  supplierId: string;
  leadTimeP50: number;       // Median lead time in days
  leadTimeP95: number;       // 95th percentile lead time
  trend: 'improving' | 'stable' | 'degrading';
  confidenceBand: {
    lower: number;
    upper: number;
  };
  freshnessMs: number;
  updatedAt: string;
}

// GET /v1/suppliers/disruption-alerts
interface DisruptionAlertsResponse {
  alerts: Array<{
    alertId: string;
    supplierId: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    disruptionProbability: number; // 0-1
    alertReasons: string[];
    affectedCategories: string[];
    affectedRegions: string[];
    estimatedResolutionDays?: number;
    createdAt: string;
  }>;
  freshnessMs: number;
}
```

### Error Schema

```typescript
interface ErrorResponse {
  error: {
    code: string;            // Machine-readable error code
    message: string;         // Human-readable message
    details?: Record<string, unknown>;
  };
  requestId: string;
  timestamp: string;
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Malformed request parameters |
| `SUPPLIER_NOT_FOUND` | 404 | Supplier ID not found |
| `PAYMENT_REQUIRED` | 402 | x402 payment not provided |
| `RATE_LIMITED` | 429 | Too many requests |
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

Write failing tests for all request/response schemas and error envelopes.

```typescript
describe('Supplier Score Schema', () => {
  it('should validate valid score request');
  it('should reject missing supplierId');
  it('should reject invalid riskTolerance enum');
  it('should validate complete score response');
  it('should include required freshness fields');
});

describe('Lead Time Forecast Schema', () => {
  it('should validate valid forecast request');
  it('should validate P50/P95 response structure');
  it('should include confidence band');
});

describe('Disruption Alerts Schema', () => {
  it('should validate alerts array structure');
  it('should validate severity enum values');
  it('should include alert reasons array');
});

describe('Error Envelope Schema', () => {
  it('should validate error response structure');
  it('should include requestId and timestamp');
  it('should map error codes to HTTP status');
});
```

### Phase 2: Business Logic Tests

Write failing tests for core data transforms and ranking/scoring behavior.

```typescript
describe('Supplier Scoring', () => {
  it('should calculate composite score from components');
  it('should weight components by risk tolerance');
  it('should normalize scores to 0-100 range');
  it('should propagate confidence from data quality');
});

describe('Lead Time Forecasting', () => {
  it('should calculate P50 from historical data');
  it('should calculate P95 with outlier handling');
  it('should detect trend direction');
  it('should compute confidence bands');
});

describe('Disruption Detection', () => {
  it('should calculate disruption probability');
  it('should classify severity levels');
  it('should generate explainable alert reasons');
  it('should filter by affected categories/regions');
});
```

### Phase 3: Integration Tests

Write failing tests for paid-route behavior (x402 required on monetized endpoints).

```typescript
describe('Payment Middleware', () => {
  it('should return 402 when no payment header');
  it('should return 402 when payment insufficient');
  it('should process request when payment valid');
  it('should track payment in receivables wallet');
});

describe('Endpoint Integration', () => {
  it('should return score after successful payment');
  it('should return forecast after successful payment');
  it('should return alerts after successful payment');
  it('should include freshness in all responses');
});
```

### Phase 4: Freshness/Quality Tests

Write failing tests for staleness thresholds and confidence propagation.

```typescript
describe('Data Freshness', () => {
  it('should reject data older than staleness threshold');
  it('should include freshnessMs in response');
  it('should propagate upstream freshness');
});

describe('Confidence Propagation', () => {
  it('should reduce confidence for stale data');
  it('should aggregate confidence from multiple sources');
  it('should cap confidence at data quality ceiling');
});

describe('SLA Compliance', () => {
  it('should respond within 500ms for cached path');
  it('should track response latency metrics');
});
```

### Phase 5: Implementation

Implement minimum code to pass tests incrementally.

### Phase 6: Refactor

Refactor with tests green, preserving API behavior and performance budgets.

## Test Coverage Requirements

### Focus Areas

- Forecast backtests against historical data
- Anomaly detection accuracy tests
- Ranking consistency across requests
- Paid endpoint guards (x402)
- SLA freshness assertions

### Coverage Targets

| Type | Target | Focus |
|------|--------|-------|
| Unit | 90% | Schema parsing, pure transforms, scoring invariants |
| Integration | 80% | Endpoint handlers + payment middleware + A2A adapters |
| Contract | 100% | Stable JSON shape, error codes, field semantics |

## Acceptance Criteria

- [ ] All monetized endpoints require payment and return valid data after successful payment
- [ ] All responses include freshness and confidence fields where relevant
- [ ] P95 response time for cached path ≤500ms under test workload
- [ ] Test suite passes in CI with no skipped critical tests
- [ ] README includes endpoint examples for agent consumers

## Deliverables

1. Source implementation with typed contracts (Zod schemas)
2. Test suite (unit + integration + contract)
3. API docs/examples for machine consumers
4. Configuration docs for pricing and receivable wallet

## Definition of Done

- [ ] PR opened referencing issue #181
- [ ] CI green with test evidence attached
- [ ] Reviewer confirms TDD order from commit history and test evolution

## TaskMarket Cross-Reference

- TaskMarket Task ID: `0xeae805c5e9439f832fe1a74ec1778252913174e11b833a1f3d1a5b7296adb36b`
- TaskMarket API URL: https://api-market.daydreams.systems/api/tasks/0xeae805c5e9439f832fe1a74ec1778252913174e11b833a1f3d1a5b7296adb36b
