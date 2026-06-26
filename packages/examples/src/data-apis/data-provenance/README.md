# Data Freshness & Provenance Verification API

A paid verification API selling dataset freshness SLAs, lineage graphs, and tamper-check attestations.

## Endpoints

| Endpoint | Price | Description |
|----------|-------|-------------|
| `/v1/provenance/lineage` | $0.50 | Get data lineage graph |
| `/v1/provenance/freshness` | $0.75 | Get freshness and SLA status |
| `/v1/provenance/verify-hash` | $1.00 | Verify data integrity via hash |

## Running

```bash
bun run packages/examples/src/data-apis/data-provenance/server.ts
bun test packages/examples/src/data-apis/data-provenance/
```
