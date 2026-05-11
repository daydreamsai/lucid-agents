# TaskMarket Data API Examples

This directory contains paid data API examples for ten TaskMarket PRDs:

- Supplier Reliability Signal Marketplace API, issue #181
- Geo Demand Pulse Index for Agent Buyers, issue #182
- Data Freshness & Provenance Verification API, issue #184
- Sanctions & PEP Exposure Intelligence API, issue #185
- Macro Event Impact Vector API for Agents, issue #186
- Cross-Chain Liquidity Snapshot Service, issue #177
- Real-Time Gas & Inclusion Probability Oracle, issue #178
- Counterparty Risk Graph Intelligence API, issue #179
- Regulatory Delta Feed for Agent Compliance, issue #180
- ERC-8004 Identity Reputation Signal API, issue #183

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

Liquidity:

```bash
GET /v1/liquidity/snapshot?chain=base&baseToken=ETH&quoteToken=USDC
GET /v1/liquidity/slippage?chain=base&baseToken=ETH&quoteToken=USDC&notionalUsd=100000
GET /v1/liquidity/routes?chain=base&baseToken=ETH&quoteToken=USDC&notionalUsd=100000
```

Gas:

```bash
GET /v1/gas/quote?chain=base&urgency=standard&targetBlocks=3
GET /v1/gas/forecast?chain=base&horizonMinutes=30
GET /v1/gas/congestion?chain=base
```

Risk:

```bash
POST /v1/risk/score
GET /v1/risk/exposure-paths?address=0x1&network=base&threshold=50
GET /v1/risk/entity-profile?address=0x1&network=base
```

Regulations:

```bash
GET /v1/regulations/delta?jurisdiction=US&industry=crypto&since=2026-01-01
GET /v1/regulations/impact?jurisdiction=US&industry=crypto&controlFramework=SOC2
POST /v1/regulations/map-controls
```

Identity:

```bash
GET /v1/identity/reputation?agentAddress=0x1&chain=base&timeframe=90d
GET /v1/identity/history?agentAddress=0x1&chain=base&timeframe=90d
GET /v1/identity/trust-breakdown?agentAddress=0x1&chain=base&evidenceDepth=3
```

## Test

```bash
bun test packages/examples/src/data-apis/__tests__/marketplace.test.ts
```
