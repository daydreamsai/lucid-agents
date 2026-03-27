# Weather Lucid Agent (x402)

Built via TaskMarket bounty on [taskmarket.xyz](https://taskmarket.xyz).

This package provides a Bun + TypeScript Lucid Agent that returns weather conditions and enforces x402-style paid access for lookups.

## Stack

- TypeScript
- Bun
- `@lucid-agents/http`
- `@lucid-agents/payments`
- Open-Meteo API (`open-meteo.com`)

## Endpoint

`GET /weather?city=Sydney`

Response shape:
```json
{
  "city": "Sydney",
  "temp_c": 24.3,
  "condition": "Partly cloudy",
  "humidity": 58
}
```

## Payment behavior (x402)

- Missing/invalid payment => `402 Payment Required`
- Valid payment header => weather response

Supported payment header input:
- `x-payment: <token>`
- `authorization: Bearer <token>`

For local/dev testing, set:
- `X402_ACCEPTED_TOKEN=dev-test-payment-token`

Then a request with `x-payment: dev-test-payment-token` is treated as paid.

## Local run

```bash
cd packages/weather-agent-x402
bun install
cp .env.example .env
bun run dev
```

## curl examples

Unpaid request (expects 402):
```bash
curl -i "http://localhost:3000/weather?city=Sydney"
```

Paid request (expects 200):
```bash
curl -i -H "x-payment: dev-test-payment-token" "http://localhost:3000/weather?city=Sydney"
```

## Deploy notes (Railway/Render/Fly.io)

- Root directory: `packages/weather-agent-x402`
- Build command: `bun install`
- Start command: `bun run start`
- Required env vars:
  - `PORT` (provided by platform)
  - `X402_ACCEPTED_TOKEN` (for static-token mode) and/or your real x402 payment verifier env vars used by `@lucid-agents/payments`