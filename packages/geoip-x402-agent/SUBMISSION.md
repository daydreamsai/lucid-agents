# TaskMarket Submission

- GitHub repo URL: https://github.com/daydreamsai/lucid-agents
- Live endpoint URL: LIVE_ENDPOINT_URL

## curl example (402 then paid success)

```bash
curl -i "LIVE_ENDPOINT_URL/geoip?ip=8.8.8.8"
```

Example 402 response body:

```json
{
  "error": "Payment required",
  "reason": "Missing x-payment header",
  "price": "0.0005",
  "currency": "USD",
  "paymentHeader": "x-payment"
}
```

```bash
curl -i -H "x-payment: dev-token-change-me" "LIVE_ENDPOINT_URL/geoip?ip=8.8.8.8"
```

Example paid response body:

```json
{
  "ip": "8.8.8.8",
  "country": "United States",
  "city": "Mountain View",
  "lat": 37.386,
  "lon": -122.0838,
  "isp": "Google LLC"
}
```

Built via TaskMarket bounty (https://taskmarket.xyz).