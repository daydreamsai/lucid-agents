# Cross-Chain Liquidity Snapshot Service

Paid API-first Lucid agent for liquidity depth, slippage curves, and route quality across EVM venues.

## Endpoints (x402 payment required)

| Endpoint | Price | Description |
|----------|-------|-------------|
| `/entrypoints/liquidity-snapshot/invoke` | $0.10 | Pool depth across venues |
| `/entrypoints/liquidity-slippage/invoke` | $0.05 | Slippage estimation & curve |
| `/entrypoints/liquidity-routes/invoke` | $0.15 | Best execution routes |

## Supported Chains
`eip155:1` (Ethereum), `eip155:137` (Polygon), `eip155:42161` (Arbitrum), `eip155:10` (Optimism), `eip155:8453` (Base)

## Supported Venues
Uniswap V3/V2, Curve, Balancer, SushiSwap, PancakeSwap

## Run
```bash
PORT=3000 bun run packages/examples/src/cross-chain-liquidity/service.ts
```

## Test
```bash
bun test packages/examples/src/cross-chain-liquidity/
```

## Architecture
Uses `@lucid-agents/core`, `@lucid-agents/http`, `@lucid-agents/payments`, `@lucid-agents/hono`
