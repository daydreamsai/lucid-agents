# Regulatory Delta Feed for Agent Compliance

Machine-readable regulation/policy deltas with impact tagging for compliance automation agents.

## Overview

This service provides structured regulatory change feeds that enable compliance agents to:
- Track regulatory changes by jurisdiction and industry
- Identify affected controls in compliance frameworks (SOC2, ISO27001, etc.)
- Auto-open remediation workflows based on impact analysis

## Endpoints

All endpoints require payment via x402 protocol and include freshness metadata.

### 1. Get Regulatory Deltas

**Endpoint:** `POST /entrypoints/regulations-delta/invoke`  
**Price:** $0.05 per call

Get regulatory changes by jurisdiction with semantic change classification and urgency scoring.

**Request:**
```json
{
  "input": {
    "jurisdiction": "US",
    "industry": "finance",
    "since": "2024-01-01T00:00:00Z",
    "source_priority": ["federal", "state"]
  }
}
```

**Response:**
```json
{
  "output": {
    "deltas": [
      {
        "rule_id": "SEC-2024-001",
        "jurisdiction": "US",
        "semantic_change_type": "modified",
        "diff_text": "Updated disclosure requirements for cybersecurity incidents",
        "effective_date": "2024-06-01T00:00:00Z",
        "urgency_score": 7.5,
        "source_url": "https://sec.gov/rules/2024-001",
        "freshness_timestamp": "2024-02-27T12:00:00Z",
        "confidence_score": 0.95
      }
    ],
    "total_count": 1,
    "freshness_timestamp": "2024-02-27T12:00:00Z"
  }
}
```

### 2. Get Impact Analysis

**Endpoint:** `POST /entrypoints/regulations-impact/invoke`  
**Price:** $0.03 per call

Get affected controls and impact analysis for a specific regulatory change.

**Request:**
```json
{
  "input": {
    "jurisdiction": "US",
    "rule_id": "SEC-2024-001",
    "control_framework": "SOC2"
  }
}
```

**Response:**
```json
{
  "output": {
    "rule_id": "SEC-2024-001",
    "affected_controls": [
      {
        "control_id": "SOC2-CC6.1",
        "control_name": "Logical and Physical Access Controls",
        "impact_level": "high",
        "remediation_required": true
      }
    ],
    "freshness_timestamp": "2024-02-27T12:00:00Z",
    "confidence_score": 0.88
  }
}
```

### 3. Map Controls to Regulations

**Endpoint:** `POST /entrypoints/regulations-map-controls/invoke`  
**Price:** $0.04 per call

Map regulations to control framework requirements for comprehensive compliance coverage.

**Request:**
```json
{
  "input": {
    "jurisdiction": "US",
    "industry": "finance",
    "control_framework": "SOC2"
  }
}
```

**Response:**
```json
{
  "output": {
    "mappings": [
      {
        "regulation_id": "SEC-2024-001",
        "control_id": "SOC2-CC6.1",
        "mapping_confidence": 0.92
      }
    ],
    "framework": "SOC2",
    "freshness_timestamp": "2024-02-27T12:00:00Z"
  }
}
```

## Data Quality Guarantees

- **Freshness:** All responses include `freshness_timestamp` indicating data currency
- **Confidence:** Responses include `confidence_score` (0-1) based on source quality and age
- **Urgency:** Changes scored 0-10 based on type, effective date, and impact level
- **Performance:** P95 response time ≤ 500ms for cached paths

## Semantic Change Types

- `added`: New regulation or requirement
- `modified`: Existing regulation updated
- `removed`: Regulation deprecated or repealed
- `clarified`: Interpretation or guidance updated

## Impact Levels

- `high`: Immediate remediation required, significant compliance risk
- `medium`: Remediation recommended, moderate compliance impact
- `low`: Awareness required, minimal compliance impact

## Supported Frameworks

- SOC2 (Service Organization Control 2)
- ISO27001 (Information Security Management)
- NIST CSF (Cybersecurity Framework)
- PCI DSS (Payment Card Industry Data Security Standard)

## Environment Variables

```bash
# Required for payment acceptance
PAYMENTS_RECEIVABLE_ADDRESS=0x...  # Your wallet address
FACILITATOR_URL=https://facilitator.daydreams.systems
NETWORK=eip155:84532  # Base Sepolia testnet

# Optional
PORT=3100  # Default port
```

## Running the Service

```bash
# Install dependencies
bun install

# Run the service
bun run packages/examples/src/regulatory-delta/index.ts

# Run tests
bun test packages/examples/src/regulatory-delta/__tests__
```

## Agent Integration Example

```typescript
import { createRuntimePaymentContext } from '@lucid-agents/payments';

// Create payment-enabled fetch
const paymentContext = await createRuntimePaymentContext({
  runtime,
  network: 'eip155:84532',
});

// Call the regulatory delta endpoint
const response = await paymentContext.fetchWithPayment(
  'http://localhost:3100/entrypoints/regulations-delta/invoke',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: {
        jurisdiction: 'US',
        industry: 'finance',
        since: '2024-01-01T00:00:00Z',
      },
    }),
  }
);

const data = await response.json();
console.log('Regulatory deltas:', data.output.deltas);
```

## TDD Implementation

This service was built following Test-Driven Development:

1. **Contract Tests** (`__tests__/contracts.test.ts`): Schema validation
2. **Business Logic Tests** (`__tests__/business-logic.test.ts`): Core transforms
3. **Integration Tests** (`__tests__/integration.test.ts`): Endpoint handlers + payments
4. **Implementation** (`index.ts`, `business-logic.ts`): Minimum code to pass tests

## License

MIT
