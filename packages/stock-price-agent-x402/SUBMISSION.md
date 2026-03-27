# TaskMarket Bounty Submission: Stock Price Lucid Agent (x402)

- GitHub repo URL: https://github.com/daydreamsai/lucid-agents
- Live endpoint URL: LIVE_ENDPOINT_URL_HERE

Built via TaskMarket bounty (taskmarket.xyz).

## curl example: 402 response

```bash
curl -i "$LIVE_ENDPOINT_URL/stock?ticker=AAPL"
```

## curl example: successful paid response

```bash
curl -i -H "x402-payment: YOUR_VALID_PAYMENT_HEADER" "$LIVE_ENDPOINT_URL/stock?ticker=AAPL"
```