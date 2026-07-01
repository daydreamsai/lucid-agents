# IP Geolocation Lucid Agent (x402 payments)

Built via TaskMarket bounty from taskmarket.xyz.

## What this package does
- Uses `@lucid-agents/http` and `@lucid-agents/payments`
- Exposes `GET /geoip?ip=8.8.8.8`
- Calls ip-api.com free tier and returns:
  - `ip`
  - `country`
  - `city`
  - `lat`
  - `lon`
  - `isp`
- Enforces x402-style payment:
  - No valid payment header => `402 Payment Required`
  - Valid payment header => returns geolocation data

## API

### `GET /geoip?ip=8.8.8.8`
Success response:
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

### Payment header
Set one of:
- `x-402-payment`
- `x402-payment`
- `x-payment`
- `authorization` (`Bearer <token>` or `x402 <token>`)

By default, token must match `X402_PAYMENT_TOKEN`.

## Local run (Bun)
```bash
bun install
cp .env.example .env
bun run dev
```

## Deployment notes
This service is ready for deployment to Railway / Render / Fly.io:
- Runtime: Bun
- Start command: `bun src/server.ts`
- Required environment variables:
  - `X402_PAYMENT_TOKEN`
  - `X402_PAYMENT_RECEIVER` (optional, default `geoip-agent`)
  - `X402_PAYMENT_NETWORK` (optional, default `base`)
  - `X402_PRICE_USD` (optional, default `0.0005`)
  - `PORT` (platform-provided)

## Quick test
```bash
# unpaid request -> 402
curl -i "http://localhost:3000/geoip?ip=8.8.8.8"

# paid request -> 200
curl -i -H "x-402-payment: dev-x402-token" "http://localhost:3000/geoip?ip=8.8.8.8"
```