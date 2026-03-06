# TaskMarket Submission — IP Geolocation Lucid Agent (x402 payments)

- GitHub repo URL: https://github.com/daydreamsai/lucid-agents
- Live endpoint URL: <LIVE_ENDPOINT_URL>

Built via TaskMarket bounty on taskmarket.xyz.

## curl examples

### 1) Unpaid request (expects 402)
```bash
curl -i "$LIVE_ENDPOINT_URL/geoip?ip=8.8.8.8"
```

Expected response status:
```text
HTTP/1.1 402 Payment Required
```

### 2) Paid request (expects 200)
```bash
curl -i \
  -H "x-402-payment: $X402_PAYMENT_TOKEN" \
  "$LIVE_ENDPOINT_URL/geoip?ip=8.8.8.8"
```

Expected success body shape:
```json
{
  "ip": "8.8.8.8",
  "country": "United States",
  "city": "Mountain View",
  "lat": 37.4056,
  "lon": -122.0775,
  "isp": "Google LLC"
}
```