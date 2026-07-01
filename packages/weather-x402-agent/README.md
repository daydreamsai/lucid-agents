# Weather Lucid Agent (x402 payments)

Production-ready weather lookup agent built with Bun, TypeScript, `@lucid-agents/http`, and `@lucid-agents/payments`.

This was built via a TaskMarket bounty and references taskmarket.xyz.

## API

`GET /weather?city=Sydney`

Success response shape:
```json
{
  "city": "Sydney",
  "temp_c": 24,
  "condition": "Partly cloudy",
  "humidity": 61
}
```

## Payment enforcement (x402)

- Price: `$0.001` per lookup
- If no valid payment header is sent, endpoint returns `402 Payment Required`
- Valid payment header for local/dev:
  - `x-payment: dev-paid-token` (or set your own `X402_PAYMENT_TOKEN`)

## Local run

```bash
bun install
bun run --cwd packages/weather-x402-agent dev
```

Or:

```bash
cd packages/weather-x402-agent
bun install
bun run dev
```

## Environment

Copy `.env.example` to `.env`:

```bash
PORT=3000
X402_PAYMENT_TOKEN=dev-paid-token
X402_PRICE_USD=0.001
```

## curl examples

402 (no payment):
```bash
curl -i "$LIVE_ENDPOINT_URL/weather?city=Sydney"
```

Successful paid response:
```bash
curl -i "$LIVE_ENDPOINT_URL/weather?city=Sydney" \
  -H "x-payment: dev-paid-token"
```

## Deploy (Railway/Render/Fly.io)

- Set start command to: `bun run src/index.ts`
- Set root directory to: `packages/weather-x402-agent`
- Configure env vars from `.env.example`
- Expose `PORT` from platform runtime