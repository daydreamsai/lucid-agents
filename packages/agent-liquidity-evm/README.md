# @lucid-agents/agent-liquidity-evm

Paid API-first Lucid agent for:

1. Minute-level liquidity depth snapshots
2. Slippage curves by venue + blended execution
3. Route quality ranking for major EVM token pairs

## Endpoints

All endpoints are paid and require signed payment headers.

1. `GET /v1/liquidity/snapshot`
2. `GET /v1/liquidity/slippage`
3. `GET /v1/liquidity/routes`

## Query parameters

### `/v1/liquidity/snapshot`
- `chainId` (number, required)
- `baseToken` (address, required)
- `quoteToken` (address, required)
- `maxAgeSec` (number, optional, freshness guard)

### `/v1/liquidity/slippage`
- `chainId` (number, required)
- `baseToken` (address, required)
- `quoteToken` (address, required)
- `side` (`buy` or `sell`, required)
- `sizeUsd` (number, optional if `sizesUsd` is set)
- `sizesUsd` (comma-separated numbers, optional if `sizeUsd` is set)
- `maxAgeSec` (number, optional)

### `/v1/liquidity/routes`
- `chainId` (number, required)
- `baseToken` (address, required)
- `quoteToken` (address, required)
- `side` (`buy` or `sell`, required)
- `sizeUsd` (number, required)
- `maxRoutes` (number, optional)
- `maxAgeSec` (number, optional)

## Payment headers

Required headers:

1. `x-lucid-api-key`
2. `x-lucid-pay-timestamp` (unix seconds)
3. `x-lucid-pay-units` (integer credits attached to request)
4. `x-lucid-pay-signature` (HMAC-SHA256 hex)

Signature payload format:

`{apiKey}:{timestamp}:{method}:{pathWithQuery}:{units}`

Example signing snippet:

```ts
import { createHmac } from "node:crypto";

function sign(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

const apiKey = "buyer-key";
const secret = "buyer-secret";
const method = "GET";
const path = "/v1/liquidity/snapshot?chainId=1&baseToken=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2&quoteToken=0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const timestamp = Math.floor(Date.now() / 1000);
const units = 1;
const payload = `${apiKey}:${timestamp}:${method}:${path}:${units}`;
const signature = sign(secret, payload);
```

## Running

```bash
pnpm --filter @lucid-agents/agent-liquidity-evm build
pnpm --filter @lucid-agents/agent-liquidity-evm dev
pnpm --filter @lucid-agents/agent-liquidity-evm test
```

## Environment

- `LIQUIDITY_AGENT_HOST` (default: `0.0.0.0`)
- `LIQUIDITY_AGENT_PORT` (default: `8787`)
- `LIQUIDITY_AGENT_MAX_AGE_SEC` (default: `60`)
- `LIQUIDITY_AGENT_TS_TOLERANCE_SEC` (default: `300`)
- `LIQUIDITY_AGENT_CLIENTS`  
  Format: `apiKey:secret:maxUnitsPerMinute,apiKey2:secret2:maxUnitsPerMinute`
- `LIQUIDITY_AGENT_COST_SNAPSHOT` (default: `1`)
- `LIQUIDITY_AGENT_COST_SLIPPAGE` (default: `2`)
- `LIQUIDITY_AGENT_COST_ROUTES` (default: `3`)

## Buyer-facing guarantees

1. Responses include `asOf` + `freshnessSec`
2. Freshness enforced server-side via `maxAgeSec`
3. Paid access is checked before computation
4. Contract schemas are tested end-to-end
5. Route ranking includes fill rate, slippage, gas, and latency signals

## Lucid package integration

This agent loads and binds:

- core
- http
- payments
- wallet
- identity
- a2a
- ap2

at runtime via the Lucid runtime bridge in `src/lucid/runtime.ts`.