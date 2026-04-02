# TaskMarket Submission - Sentiment Analysis Lucid Agent (x402)

## GitHub repo URL
https://github.com/daydreamsai/lucid-agents

## Live endpoint URL
<LIVE_ENDPOINT_URL>

## curl example (expects 402 without payment)

```bash
curl -i -X POST "$LIVE_ENDPOINT_URL/sentiment" \
  -H "Content-Type: application/json" \
  -d '{"text":"I love this product"}'
```

Expected response shape:

```json
{
  "error": "payment_required",
  "reason": "missing_payment",
  "message": "Payment required. Include a valid x402 payment header.",
  "x402": {
    "amountUsd": 0.001,
    "acceptedHeader": "x402-payment",
    "endpoint": "/sentiment",
    "method": "POST"
  }
}
```

## curl example (successful paid response)

```bash
curl -i -X POST "$LIVE_ENDPOINT_URL/sentiment" \
  -H "Content-Type: application/json" \
  -H "x402-payment: demo-valid-payment" \
  -d '{"text":"I love this product"}'
```

Expected response shape:

```json
{
  "sentiment": "positive",
  "score": 0.92,
  "label": "P+"
}
```

Built via TaskMarket bounty (taskmarket.xyz).