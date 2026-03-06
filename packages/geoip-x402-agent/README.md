# IP Geolocation Lucid Agent (x402 payments)

Bun + TypeScript Lucid Agent that resolves geolocation for any IP using ip-api.com free tier and enforces x402-style payment before lookup.

Built via TaskMarket bounty on taskmarket.xyz.

## Route

`GET /geoip?ip=8.8.8.8`

Successful response shape:

```json
{
  "ip": "8.8.8.8",
  "country": "United States",
  "city": "Mountain View",
  "lat": 37.4229,
  "lon": -122.085,
  "isp": "Google LLC"
}
```

## Payment enforcement

No payment header returns HTTP 402.
Valid payment header returns HTTP 200 with geolocation payload.

Accepted payment headers:
- `x402-payment` (preferred)
- `x-payment`
- `payment`

By default, set `X402_PAYMENT_TOKEN` and send the same value in `x402-payment`.

## Local run

```bash
bun install
bun run --cwd packages/geoip-x402-agent dev
```

## Production run

```bash
bun install --frozen-lockfile
bun run --cwd packages/geoip-x402-agent start
```

## Curl examples

402 response:

```bash
LIVE_ENDPOINT=<LIVE_ENDPOINT_URL>
curl -i "$LIVE_ENDPOINT/geoip?ip=8.8.8.8"
```

Successful paid response:

```bash
LIVE_ENDPOINT=<LIVE_ENDPOINT_URL>
curl -i "$LIVE_ENDPOINT/geoip?ip=8.8.8.8" \
  -H "x402-payment: $X402_PAYMENT_TOKEN"
```

## Deploy

This package includes Docker and platform config for Railway, Render, and Fly.

Required env vars:
- `PORT` (platform usually injects this)
- `X402_PAYMENT_TOKEN` (required in production)

## Repo

`https://github.com/daydreamsai/lucid-agents`