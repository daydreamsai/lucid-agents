# Sentiment Analysis Lucid Agent (x402 payments)

Built via TaskMarket bounty.  
Task marketplace reference: taskmarket.xyz

This package provides a Bun + TypeScript Lucid Agent endpoint:

- `POST /sentiment`
- Request body: `{"text":"I love this product"}`
- Response: `{"sentiment":"positive","score":0.92,"label":"P+"}` (shape guaranteed; score varies by input/provider)
- Enforces x402-style payment: returns HTTP 402 unless valid payment header is provided.

## Stack

- TypeScript
- Bun
- `@lucid-agents/http`
- `@lucid-agents/payments`

## Environment

Copy `.env.example` to `.env` and set:

- `SENTIMENT_API_URL` (MeaningCloud free-tier sentiment endpoint)
- `MEANINGCLOUD_API_KEY`
- `X402_PAYMENT_TOKEN` (token expected in the `x402-payment` header, or custom header via `X402_PAYMENT_HEADER`)

## Run locally

```bash
bun install
bun run dev
```

Default port is `3000`.

## API behavior

### `POST /sentiment`

Request:
```json
{ "text": "I love this product" }
```

Success response:
```json
{ "sentiment": "positive", "score": 0.92, "label": "P+" }
```

If no payment header:
- Status `402`
- Includes x402 metadata in both response headers and JSON body.

## curl examples

402 expected (missing payment):
```bash
curl -i -X POST "$LIVE_ENDPOINT_URL/sentiment" \
  -H "content-type: application/json" \
  -d '{"text":"I love this product"}'
```

200 expected (valid payment header):
```bash
curl -i -X POST "$LIVE_ENDPOINT_URL/sentiment" \
  -H "content-type: application/json" \
  -H "x402-payment: dev_paid_token" \
  -d '{"text":"I love this product"}'
```

## Deployment

Deploy with Railway, Render, or Fly.io using Bun runtime.  
Set environment variables from `.env.example` in your deployment environment.