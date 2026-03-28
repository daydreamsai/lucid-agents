# @lucid-agents/provenance

Data Freshness & Provenance Verification API for agent-to-agent trust.

## Overview

Paid verification endpoints for:
- **Dataset freshness SLAs** - Check staleness and SLA compliance
- **Lineage graphs** - Trace data provenance through transformations
- **Hash verification** - Tamper-check attestations for data integrity

## Installation

```bash
bun add @lucid-agents/provenance
```

## Quick Start

```typescript
import { provenance } from '@lucid-agents/provenance';

agent.use(provenance({
  dataStore,
  defaultSlaThresholdMs: 60000,
  pricing: {
    lineage: { amount: '0.001', currency: 'USDC' },
    freshness: { amount: '0.0005', currency: 'USDC' },
    verifyHash: { amount: '0.002', currency: 'USDC' },
  },
}));
```

## API Endpoints

### GET /v1/provenance/lineage
Returns data lineage graph with nodes, edges, and attestations.

### GET /v1/provenance/freshness  
Returns staleness, SLA status (met/warning/breached), and confidence.

### POST /v1/provenance/verify-hash
Verifies dataset hash integrity with attestation references.

## Confidence Scoring

- **Freshness** (40%) - Exponential decay based on staleness
- **Attestations** (30%) - Logarithmic growth with attestation count
- **Source reliability** (30%) - Direct factor from source trust score

## License

MIT
