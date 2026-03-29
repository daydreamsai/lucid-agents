# ERC-8004 Identity Reputation Signal API

A paid identity data API that sells agent trust/reputation signals from ERC-8004 plus verified offchain performance evidence.

## Endpoints

| Endpoint | Price | Description |
|----------|-------|-------------|
| `/v1/identity/reputation` | $0.75 | Get trust score and reputation |
| `/v1/identity/history` | $1.00 | Get performance history |
| `/v1/identity/trust-breakdown` | $1.50 | Get detailed trust decomposition |

## Running

```bash
bun run packages/examples/src/data-apis/identity-reputation/server.ts
bun test packages/examples/src/data-apis/identity-reputation/
```
