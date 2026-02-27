# Sanctions & PEP Exposure Intelligence API

Paid compliance API that provides sanctions screening, PEP (Politically Exposed Person) exposure checks, and watchlist monitoring with ownership-chain risk context.

## Overview

This agent provides machine-readable AML screening results with explainable evidence for KYB/KYC automation. All endpoints require payment via x402 and return deterministic JSON with strict Zod validation.

## Endpoints

### POST /v1/screening/check

Screen an entity against sanctions lists and PEP databases.

**Price:** $0.10 per check

**Request:**
```json
{
  "entityName": "Acme Corp",
  "identifiers": {
    "taxId": "12-3456789",
    "registrationNumber": "ABC123"
  },
  "addresses": ["123 Main St, New York, NY"]
}
```

**Response:**
```json
{
  "screening_status": "clear|flagged|blocked",
  "match_confidence": 0.95,
  "matches": [
    {
      "list": "OFAC SDN",
      "entity": "Acme Corp",
      "confidence": 0.95,
      "reason": "Exact name match"
    }
  ],
  "evidence_bundle": {
    "sources": ["OFAC", "UN", "EU"],
    "last_updated": "2024-02-27T12:00:00Z"
  },
  "freshness": {
    "data_age_hours": 2,
    "next_refresh": "2024-02-27T14:00:00Z"
  }
}
```

### GET /v1/screening/exposure-chain

Analyze ownership chain for sanctions/PEP exposure.

**Price:** $0.15 per analysis

**Request:**
```json
{
  "entityName": "Acme Corp",
  "ownershipDepth": 3
}
```

**Response:**
```json
{
  "exposure_chain": [
    {
      "level": 1,
      "entity": "Parent Corp",
      "ownership_pct": 75.0,
      "exposure_type": "pep",
      "confidence": 0.88
    }
  ],
  "aggregate_risk": "high|medium|low",
  "freshness": {
    "data_age_hours": 4,
    "next_refresh": "2024-02-27T16:00:00Z"
  }
}
```

### GET /v1/screening/jurisdiction-risk

Assess jurisdiction-specific compliance risks.

**Price:** $0.08 per jurisdiction

**Request:**
```json
{
  "jurisdictions": ["US", "EU", "CN"]
}
```

**Response:**
```json
{
  "jurisdiction_risk": [
    {
      "jurisdiction": "US",
      "risk_level": "low",
      "sanctions_active": true,
      "pep_requirements": "enhanced_due_diligence"
    }
  ],
  "freshness": {
    "data_age_hours": 24,
    "next_refresh": "2024-02-28T12:00:00Z"
  }
}
```

## Setup

### Environment Variables

Create a `.env` file:

```bash
# x402 Payment Configuration
FACILITATOR_URL=https://facilitator.daydreams.systems
PAYMENTS_RECEIVABLE_ADDRESS=0xYourWalletAddress
NETWORK=eip155:84532  # Base Sepolia

# Optional: Custom port
PORT=3010
```

### Installation

```bash
# Install dependencies (from repo root)
bun install

# Run the agent
bun run packages/examples/src/sanctions-pep/index.ts
```

## Testing

```bash
# Run all tests
bun test packages/examples/src/sanctions-pep

# Run specific test suites
bun test packages/examples/src/sanctions-pep/__tests__/contracts.test.ts
bun test packages/examples/src/sanctions-pep/__tests__/business-logic.test.ts
bun test packages/examples/src/sanctions-pep/__tests__/integration.test.ts
```

## Usage Example

```bash
# Check entity screening (requires payment)
curl -X POST http://localhost:3010/v1/screening/check \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <x402-token>" \
  -d '{
    "entityName": "Test Corp",
    "identifiers": {"taxId": "12-3456789"},
    "addresses": ["123 Main St"]
  }'

# Get exposure chain
curl -X GET http://localhost:3010/v1/screening/exposure-chain \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <x402-token>" \
  -d '{
    "entityName": "Test Corp",
    "ownershipDepth": 3
  }'

# Check jurisdiction risk
curl -X GET http://localhost:3010/v1/screening/jurisdiction-risk \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <x402-token>" \
  -d '{
    "jurisdictions": ["US", "EU"]
  }'
```

## Architecture

- **Runtime:** `@lucid-agents/core`
- **Transport:** `@lucid-agents/http`
- **Payments:** `@lucid-agents/payments` (x402)
- **Wallet:** `@lucid-agents/wallet`
- **Validation:** Zod schemas

## Performance

- P95 response time: <500ms (cached path)
- Freshness: Data refreshed every 2-24 hours depending on endpoint
- Confidence: All matches include confidence scores (0.0-1.0)

## License

MIT
