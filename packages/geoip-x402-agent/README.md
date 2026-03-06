# GeoIP x402 Lucid Agent

Bun + TypeScript Lucid Agent that returns IP geolocation using ip-api.com and enforces x402-style payment before each lookup.

This was built via a TaskMarket bounty on https://taskmarket.xyz.

## Features

- Uses `@lucid-agents/http` and `@lucid-agents/payments`
- `GET /geoip?ip=8.8.8.8`
- Returns:
  - `ip`
  - `country`
  - `city`
  - `lat`
  - `lon`
  - `isp`
- Enforces payment:
  - no valid payment header -> `402 Payment Required`
  - valid payment header -> `200 OK` with geolocation payload

## Local run

```bash
bun install
cp .env.example .env
bun run dev
```

## Environment variables

- `PORT` (default: `3000`)
- `X402_PRICE` (default: `0.0005`)
- `X402_PAYMENT_HEADER` (default: `x-payment`)
- `X402_DEV_TOKEN` (default: `dev-token-change-me`)
- `IP_API_BASE` (default: `http://ip-api.com/json`)
- `UPSTREAM_TIMEOUT_MS` (default: `5000`)

## API

### GET /geoip?ip=8.8.8.8

Requires a valid payment header.

Successful response:

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

## Curl examples

```bash
BASE_URL="http://localhost:3000"
curl -i "$BASE_URL/geoip?ip=8.8.8.8"
```

Expected: `402 Payment Required`

```bash
BASE_URL="http://localhost:3000"
curl -i -H "x-payment: dev-token-change-me" "$BASE_URL/geoip?ip=8.8.8.8"
```

Expected: `200 OK` and geolocation JSON.

## Deploy (Railway / Render / Fly.io)

Use start command:

```bash
bun run start
```

Set required environment variables in the platform dashboard (especially `X402_DEV_TOKEN` and `X402_PRICE`).