# Macro Event Impact Vector API

A paid macro-data API that sells event-normalized impact vectors for sectors, assets, and supply chains.

## Endpoints

| Endpoint | Price | Description |
|----------|-------|-------------|
| `/v1/macro/events` | $0.50 | Get macro event feed |
| `/v1/macro/impact-vectors` | $1.00 | Get impact vectors for sectors/assets |
| `/v1/macro/scenario-score` | $1.50 | Score custom scenario assumptions |

## Running

```bash
bun run packages/examples/src/data-apis/macro-impact/server.ts
bun test packages/examples/src/data-apis/macro-impact/
```
