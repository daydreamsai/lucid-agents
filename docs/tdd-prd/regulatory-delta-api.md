# TDD PRD: Regulatory Delta Feed for Agent Compliance

Status: Draft
Issue: #180
Bounty: $3
Owner: @dagangtj
Last Updated: 2026-02-26

## Summary

Build a paid API that sells machine-readable regulation/policy deltas with impact tagging for compliance automation agents.

## Problem

Compliance agents waste cycles on unstructured legal updates and miss critical rule changes. They need structured rule diffs with impacted control tags to auto-open remediation workflows.

## Goals

- Provide structured regulation diffs with semantic change types
- Map rule changes to affected compliance controls
- Deliver urgency scoring for prioritization
- Enforce payment via x402 on all monetized endpoints
- Guarantee P95 response time ≤500ms for cached paths

## Non-Goals

- Legal interpretation or advice
- Building regulation ingestion pipelines
- Compliance workflow management UI

## User Stories

### Agent-to-Agent

As a compliance automation agent, I need structured rule diffs and impacted control tags so I can auto-open remediation workflows.

## API Contract (v1)

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/regulations/delta` | Get regulation changes since timestamp |
| GET | `/v1/regulations/impact` | Get impact analysis for changes |
| POST | `/v1/regulations/map-controls` | Map changes to control framework |

### Request Schema

```typescript
// GET /v1/regulations/delta
interface RegulationDeltaRequest {
  jurisdiction: string;      // Required: jurisdiction code
  industry?: string;         // Optional: industry filter
  since: string;             // Required: ISO 8601 timestamp
  sourcePriority?: string[]; // Optional: preferred sources
}

// GET /v1/regulations/impact
interface RegulationImpactRequest {
  deltaId: string;           // Required: delta identifier
  controlFramework?: string; // Optional: e.g., 'SOC2', 'ISO27001'
}

// POST /v1/regulations/map-controls
interface MapControlsRequest {
  jurisdiction: string;
  industry: string;
  controlFramework: string;  // Required: target framework
  ruleIds: string[];         // Required: rules to map
}
```

### Response Schema

```typescript
// GET /v1/regulations/delta
interface RegulationDeltaResponse {
  deltas: Array<{
    deltaId: string;
    jurisdiction: string;
    ruleId: string;
    ruleName: string;
    semanticChangeType: 'addition' | 'modification' | 'removal' | 'clarification';
    diff: {
      before?: string;
      after: string;
      summary: string;
    };
    effectiveDate: string;
    urgencyScore: number;    // 0-1 priority score
    sourceUrl: string;
  }>;
  freshnessMs: number;
  updatedAt: string;
}

// GET /v1/regulations/impact
interface RegulationImpactResponse {
  deltaId: string;
  affectedControls: Array<{
    controlId: string;
    controlName: string;
    impactLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
    requiredActions: string[];
  }>;
  complianceGap: {
    currentState: string;
    requiredState: string;
    remediationSteps: string[];
  };
  freshnessMs: number;
}

// POST /v1/regulations/map-controls
interface MapControlsResponse {
  mappings: Array<{
    ruleId: string;
    controlId: string;
    mappingConfidence: number;
    rationale: string;
  }>;
  unmappedRules: string[];
  freshnessMs: number;
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_JURISDICTION` | 400 | Unsupported jurisdiction |
| `INVALID_DATE_FORMAT` | 400 | Invalid timestamp format |
| `DELTA_NOT_FOUND` | 404 | Delta ID not found |
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
describe('Regulation Delta Schema', () => {
  it('should validate valid delta request');
  it('should reject invalid jurisdiction');
  it('should reject invalid date format');
  it('should validate semantic change type enum');
  it('should include diff structure');
});

describe('Impact Analysis Schema', () => {
  it('should validate impact level enum');
  it('should include required actions array');
  it('should validate compliance gap structure');
});

describe('Control Mapping Schema', () => {
  it('should validate mapping confidence range');
  it('should include rationale');
  it('should list unmapped rules');
});
```

### Phase 2: Business Logic Tests

```typescript
describe('Delta Detection', () => {
  it('should detect additions correctly');
  it('should detect modifications correctly');
  it('should detect removals correctly');
  it('should classify clarifications');
  it('should generate accurate diffs');
});

describe('Urgency Scoring', () => {
  it('should score based on effective date proximity');
  it('should weight by change severity');
  it('should factor in industry relevance');
});

describe('Control Mapping', () => {
  it('should map rules to controls accurately');
  it('should calculate mapping confidence');
  it('should identify unmappable rules');
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
  it('should return deltas after payment');
  it('should return impact analysis after payment');
  it('should return control mappings after payment');
});
```

### Phase 4: Freshness/Quality Tests

```typescript
describe('Data Freshness', () => {
  it('should include freshnessMs in all responses');
  it('should track source update timestamps');
});

describe('Date Handling', () => {
  it('should parse ISO 8601 dates correctly');
  it('should handle timezone conversions');
  it('should validate effective dates');
});
```

## Test Coverage Requirements

| Type | Target | Focus |
|------|--------|-------|
| Unit | 90% | Diff generation, scoring, mapping |
| Integration | 80% | Endpoints + payment + A2A |
| Contract | 100% | JSON shape, error codes |

## Acceptance Criteria

- [ ] All monetized endpoints require payment
- [ ] All responses include freshness fields
- [ ] P95 response time ≤500ms for cached path
- [ ] Test suite passes in CI
- [ ] README includes endpoint examples

## Definition of Done

- [ ] PR opened referencing issue #180
- [ ] CI green with test evidence
- [ ] Reviewer confirms TDD order

## TaskMarket Cross-Reference

- TaskMarket Task ID: `0x111024dcee0ef86ed623d7f926ead0f089fb9a5a2939adb1bba9c0fdc48b92bd`
- TaskMarket API URL: https://api-market.daydreams.systems/api/tasks/0x111024dcee0ef86ed623d7f926ead0f089fb9a5a2939adb1bba9c0fdc48b92bd
