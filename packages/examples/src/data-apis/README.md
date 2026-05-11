# TaskMarket Data API Examples

This directory contains paid data API examples for five TaskMarket PRDs:

- Supplier Reliability Signal Marketplace API, issue #181
- Geo Demand Pulse Index for Agent Buyers, issue #182
- Data Freshness & Provenance Verification API, issue #184
- Sanctions & PEP Exposure Intelligence API, issue #185
- Macro Event Impact Vector API for Agents, issue #186

Each API is built with Lucid core, HTTP, payments, and Zod contracts. Monetized routes return `402` with the x402 v2 `PAYMENT-REQUIRED` response header until the caller provides a valid payment credential, and return deterministic JSON with freshness and confidence metadata when paid.

## Endpoints

Supplier:

```bash
GET /v1/suppliers/score?supplierId=supplier-acme&category=components&region=na
GET /v1/suppliers/lead-time-forecast?supplierId=supplier-acme&horizonDays=30
GET /v1/suppliers/disruption-alerts?supplierId=supplier-acme
```

Demand:

```bash
GET /v1/demand/index?geoType=city&geoCode=SFO&category=apparel
GET /v1/demand/trend?geoCode=SFO&category=apparel&lookbackWindow=30d&seasonalityMode=weekly
GET /v1/demand/anomalies?geoCode=SFO&category=apparel
```

Provenance:

```bash
GET /v1/provenance/lineage?datasetId=dataset-prices&sourceId=source-primary
GET /v1/provenance/freshness?datasetId=dataset-prices&sourceId=source-primary&maxStalenessMs=300000
POST /v1/provenance/verify-hash
```

Screening:

```bash
POST /v1/screening/check
GET /v1/screening/exposure-chain?entityName=Acme%20Trading%20LLC
GET /v1/screening/jurisdiction-risk?jurisdictions=US,CA
```

Macro:

```bash
GET /v1/macro/events?eventTypes=rates,energy&geography=global
GET /v1/macro/impact-vectors?sectorSet=energy,retail&horizon=30d
POST /v1/macro/scenario-score
```

## Test

```bash
bun test packages/examples/src/data-apis/__tests__/marketplace.test.ts
```
