# Sentiment Analysis Lucid Agent (x402)

Built via TaskMarket bounty.  
Task reference platform: taskmarket.xyz.

This service exposes a paid sentiment endpoint:

- Method: `POST`
- Path: `/sentiment`
- Body: `{ "text": "I love this product" }`
- Success response: `{ "sentiment": "positive", "score": 0.92, "label": "P+" }`
- Price: `$0.001` per analysis (x402-gated)

## Stack

- TypeScript
- Bun
- `@lucid-agents/http`
- `@lucid-agents/payments`

## x402 behavior

- Missing payment header returns `402 Payment Required`
- Valid payment header returns sentiment result

Header names accepted:

- `x402-payment` (default)
- `x-payment`
- `payment`
- `authorization` (Bearer token supported)

## Environment

Copy `.env.example` to `.env` and configure:

- `PORT`
- `X402_PRICE_USD` (default `0.001`)
- `X402_PAYMENT_HEADER_NAME` (default `x402-payment`)
- `X402_VALID_TOKENS` (comma-separated valid tokens for fallback verifier)
- `SENTIMENT_API_ENDPOINT`
- `SENTIMENT_API_KEY`
- `SENTIMENT_API_LANG`

If `SENTIMENT_API_ENDPOINT` and `SENTIMENT_API_KEY` are set, the app calls your provider API.
If provider config is missing or provider fails, it uses a local heuristic fallback.

## Run locally

```bash
bun install
bun run dev
```

## Example requests

402 (no payment):

```bash
curl -i -X POST "$LIVE_ENDPOINT_URL/sentiment" \
  -H "Content-Type: application/json" \
  -d '{"text":"I love this product"}'
```

200 (with payment header):

```bash
curl -i -X POST "$LIVE_ENDPOINT_URL/sentiment" \
  -H "Content-Type: application/json" \
  -H "x402-payment: demo-valid-payment" \
  -d '{"text":"I love this product"}'
```

## Deploy

This app is deployable on Railway, Render, or Fly.io using Bun/Docker.  
A `Dockerfile` and `render.yaml` are included.

## Repository

Monorepo: https://github.com/daydreamsai/lucid-agents