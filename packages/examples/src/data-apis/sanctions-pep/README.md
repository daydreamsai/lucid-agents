# Sanctions & PEP Exposure Intelligence API

A paid compliance API that provides sanctions screening, PEP (Politically Exposed Persons) checks, and ownership-chain risk analysis for KYB/KYC agents.

## Overview

This API enables onboarding and payment agents to perform fast, machine-readable AML screening with explainable evidence. All endpoints require x402 payment and return deterministic JSON contracts with strict Zod validation.

## Endpoints

### POST /entrypoints/screening-check/invoke
Screen an entity against sanctions lists and PEP databases.

**Price:** $0.50 per check

**Input:**
```json
{
  "entity_name": "John Doe",
  "entity_type": "individual",
  "identifiers": [
    { "type": "passport", "value": "AB123456", "country": "US" }
  ],
  "addresses": [
    { "country": "US", "city": "New York" }
  ],
  "date_of_birth": "1980-01-15",
  "nationality": "US",
  "include_pep": true,
  "include_sanctions": true,
  "fuzzy_threshold": 0.85
}
```

**Output:**
```json
{
  "screening_status": "clear|potential_match|confirmed_match|escalate",
  "match_confidence": "low|medium|high|exact",
  "risk_score": 0-100,
  "evidence_bundle": {
    "sanctions_matches": [...],
    "pep_matches": [...],
    "adverse_media_count": 0,
    "data_sources_checked": ["OFAC_SDN", "EU_SANCTIONS", ...],
    "search_parameters_used": {...}
  },
  "rationale": "Human-readable explanation",
  "recommended_action": "auto_approve|manual_review|escalate|reject",
  "freshness": {
    "generated_at": "2024-01-15T10:30:00.000Z",
    "staleness_ms": 3600000,
    "sla_status": "fresh|stale|expired"
  },
  "confidence": 0.95
}
```

### POST /entrypoints/exposure-chain/invoke
Analyze ownership chain for sanctions/PEP exposure.

**Price:** $2.00 per analysis

**Input:**
```json
{
  "entity_name": "Acme Corp",
  "entity_type": "organization",
  "ownership_depth": 3,
  "include_indirect": true
}
```

**Output:**
```json
{
  "root_entity": "Acme Corp",
  "ownership_chain": [
    {
      "entity_id": "ent-001",
      "entity_name": "Acme Corp",
      "entity_type": "organization",
      "ownership_percentage": 100,
      "control_type": "direct|indirect|beneficial",
      "jurisdiction": "US",
      "risk_flags": [],
      "sanctions_exposure": false,
      "pep_exposure": false
    }
  ],
  "total_depth_analyzed": 3,
  "high_risk_paths": [
    {
      "path": ["Entity A", "Entity B", "Sanctioned Entity"],
      "risk_reason": "Ownership chain leads to sanctioned entity",
      "risk_level": "critical"
    }
  ],
  "aggregate_exposure": {
    "sanctions_exposed_entities": 0,
    "pep_exposed_entities": 0,
    "high_risk_jurisdictions": []
  },
  "freshness": {...},
  "confidence": 0.9
}
```

### POST /entrypoints/jurisdiction-risk/invoke
Get risk assessment for specified jurisdictions.

**Price:** $0.25 per batch

**Input:**
```json
{
  "jurisdictions": ["US", "RU", "IR", "KP"],
  "include_sanctions_programs": true,
  "include_fatf_status": true
}
```

**Output:**
```json
{
  "jurisdiction_risks": [
    {
      "jurisdiction": "US",
      "jurisdiction_name": "United States",
      "overall_risk": "low",
      "sanctions_programs_active": [],
      "fatf_status": "member",
      "cpi_score": 67,
      "risk_factors": []
    },
    {
      "jurisdiction": "KP",
      "jurisdiction_name": "North Korea",
      "overall_risk": "critical",
      "sanctions_programs_active": ["DPRK", "DPRK2"],
      "fatf_status": "black_list",
      "risk_factors": ["Comprehensive sanctions", "Nuclear proliferation"]
    }
  ],
  "high_risk_count": 2,
  "freshness": {...},
  "confidence": 0.95
}
```

## Running the API

```bash
# Install dependencies
cd /path/to/lucid-agents
bun install

# Run the API server
PORT=3002 bun run packages/examples/src/data-apis/sanctions-pep/agent.ts
```

## Running Tests

```bash
# Run all tests
bun test packages/examples/src/data-apis/sanctions-pep/

# Run specific test files
bun test packages/examples/src/data-apis/sanctions-pep/schema.test.ts
bun test packages/examples/src/data-apis/sanctions-pep/screening.test.ts
bun test packages/examples/src/data-apis/sanctions-pep/agent.test.ts
```

## Configuration

Environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3002` |
| `PAYMENT_ADDRESS` | Wallet address for receiving payments | Hardhat account #1 |
| `PAYMENT_NETWORK` | Blockchain network for payments | `eip155:84532` (Base Sepolia) |
| `FACILITATOR_URL` | x402 facilitator URL | `https://facilitator.daydreams.systems` |

## Architecture

This API uses the following Lucid Agents packages:

- `@lucid-agents/core` - Protocol-agnostic agent runtime
- `@lucid-agents/http` - HTTP extension for request/response handling
- `@lucid-agents/hono` - Hono HTTP server adapter
- `@lucid-agents/payments` - x402 payment utilities

## Data Sources

The current implementation uses mock data for demonstration. In production, integrate with:

- **Sanctions Lists:** OFAC SDN, EU Consolidated List, UN Sanctions, UK Sanctions
- **PEP Databases:** Commercial PEP data providers
- **Ownership Data:** Corporate registry APIs, beneficial ownership databases
- **Jurisdiction Risk:** FATF evaluations, Transparency International CPI

## Error Codes

| Code | Description |
|------|-------------|
| `INVALID_INPUT` | Request validation failed |
| `ENTITY_NOT_FOUND` | Entity could not be resolved |
| `RATE_LIMITED` | Too many requests |
| `UPSTREAM_ERROR` | Data source unavailable |
| `PAYMENT_REQUIRED` | x402 payment not provided |
| `INTERNAL_ERROR` | Unexpected server error |

## License

MIT - See repository root for full license.
