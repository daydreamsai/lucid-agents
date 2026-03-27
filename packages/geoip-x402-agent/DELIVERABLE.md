# Deliverable

- GitHub repo URL: https://github.com/daydreamsai/lucid-agents
- Live endpoint URL: <LIVE_ENDPOINT_URL>

## 402 response example

```bash
LIVE_ENDPOINT=<LIVE_ENDPOINT_URL>
curl -i "$LIVE_ENDPOINT/geoip?ip=8.8.8.8"
```

## Successful paid response example

```bash
LIVE_ENDPOINT=<LIVE_ENDPOINT_URL>
curl -i "$LIVE_ENDPOINT/geoip?ip=8.8.8.8" \
  -H "x402-payment: $X402_PAYMENT_TOKEN"
```