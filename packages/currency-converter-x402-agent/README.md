# Currency Converter Lucid Agent (x402)

Built via TaskMarket bounty on taskmarket.xyz.

This package adds a Bun + TypeScript Lucid Agent that converts currencies through frankfurter.app and enforces x402-style payment for each lookup.

## What it does
- Uses `@lucid-agents/http` for HTTP response integration (with safe native fallback).
- Uses `@lucid-agents/payments` for payment verification hooks (with deterministic fallback token verification).
- Exposes:
  - `GET /convert?from=USD&to=EUR&amount=100`
  - `GET /health`
- Charges $0.001 per conversion request through payment enforcement.
- Returns JSON:
  - `{ from, to, amount, result, rate }`

## Local run
```bash
cp .env.example .env
bun install
bun run dev
```

## Required payment header
By default (local/dev), a valid paid request is:
- `x-payment: demo_x402_paid`

Set your own value in `X402_TEST_TOKEN` for production.

## curl examples

### 1) Request without payment (returns 402)
```bash
curl -i "http://localhost:3000/convert?from=USD&to=EUR&amount=100"
```

Example response body:
```json
{
  "error": "payment_required",
  "message": "x402 payment is required for /convert",
  "reason": "Missing payment header",
  "payment": {
    "amount_usd": 0.001,
    "header": "x-payment",
    "accepts": "x402 payment token"
  }
}
```

### 2) Paid request (returns 200)
```bash
curl -i \
  -H "x-payment: demo_x402_paid" \
  "http://localhost:3000/convert?from=USD&to=EUR&amount=100"
```

Example response body:
```json
{
  "from": "USD",
  "to": "EUR",
  "amount": 100,
  "result": 92.11,
  "rate": 0.9211
}
```

## Deploy (Railway / Render / Fly.io)
- Service listens on `PORT` and `HOST`.
- Health endpoint: `GET /health`.
- Start command: `bun run start`.
- Use environment variables from `.env.example`.

## Task deliverable note
See `TASKMARKET_SUBMISSION.md` for the exact submission format required by the bounty.