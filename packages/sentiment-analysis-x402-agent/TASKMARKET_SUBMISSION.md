# TaskMarket Bounty Submission

## GitHub repo URL
https://github.com/daydreamsai/lucid-agents

## Live endpoint URL
<LIVE_ENDPOINT_URL>

## curl example (402 without payment)

```bash
curl -i -X POST "$LIVE_ENDPOINT_URL/sentiment" \
  -H "content-type: application/json" \
  -d '{"text":"I love this product"}'
```

## curl example (successful paid request)

```bash
curl -i -X POST "$LIVE_ENDPOINT_URL/sentiment" \
  -H "content-type: application/json" \
  -H "x402-payment: dev_paid_token" \
  -d '{"text":"I love this product"}'
```

Built via TaskMarket bounty at taskmarket.xyz.