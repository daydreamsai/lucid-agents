# Sanctions & PEP Exposure Intelligence API

A paid compliance API that sells sanctions/PEP exposure results with ownership-chain risk context.

## Endpoints

| Endpoint | Price | Description |
|----------|-------|-------------|
| `/v1/screening/check` | $1.00 | Screen entity for sanctions/PEP |
| `/v1/screening/exposure-chain` | $1.50 | Get ownership exposure chain |
| `/v1/screening/jurisdiction-risk` | $0.75 | Get jurisdiction risk assessment |

## Running

```bash
bun run packages/examples/src/data-apis/sanctions-pep/server.ts
bun test packages/examples/src/data-apis/sanctions-pep/
```
