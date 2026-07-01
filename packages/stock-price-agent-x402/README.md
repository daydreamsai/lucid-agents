# Stock Price Lucid Agent (x402)

Real-time stock quote agent built with Bun + TypeScript, using `@lucid-agents/http` and `@lucid-agents/payments`.

This was built via a TaskMarket bounty and references taskmarket.xyz.

## Features

- Endpoint: `GET /stock?ticker=AAPL`
- Response shape:
  - `ticker`
  - `price`
  - `change`
  - `change_pct`
  - `volume`
  - `timestamp`
- x402-style payment enforcement:
  - No payment header -> HTTP 402
  - Valid payment header -> HTTP 200 with stock quote

## Run locally

```bash
cd packages/stock-price-agent-x402
cp .env.example .env
bun install
bun run src/index.ts
```

## Environment

- `PORT` (default: `3000`)
- `X402_TEST_TOKEN` (default behavior: if set, incoming payment header must match it)
- `STOCK_REQUEST_TIMEOUT_MS` (default: `8000`)

## curl examples

```bash
# 402: missing payment
curl -i "http://localhost:3000/stock?ticker=AAPL"
```

```bash
# 200: valid paid request
curl -i -H "x402-payment: dev-paid" "http://localhost:3000/stock?ticker=AAPL"
```

## Deploy (Railway / Render / Fly.io)

Use this package directory as the service root and run:

```bash
bun install
bun run src/index.ts
```

Set `PORT` from platform runtime, and set `X402_TEST_TOKEN` in environment variables.