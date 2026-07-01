# TaskMarket Bounty Submission

- GitHub repo URL: https://github.com/daydreamsai/lucid-agents
- Live endpoint URL: <LIVE_ENDPOINT_URL>

## curl proof

### 1) 402 without payment
```bash
curl -i "<LIVE_ENDPOINT_URL>/convert?from=USD&to=EUR&amount=100"
```

Expected status:
```text
HTTP/1.1 402 Payment Required
```

### 2) Successful paid request
```bash
curl -i \
  -H "x-payment: demo_x402_paid" \
  "<LIVE_ENDPOINT_URL>/convert?from=USD&to=EUR&amount=100"
```

Expected response shape:
```json
{
  "from": "USD",
  "to": "EUR",
  "amount": 100,
  "result": 92.11,
  "rate": 0.9211
}
```