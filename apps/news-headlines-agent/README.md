# News Headlines Lucid Agent (x402)

This is a Bun + TypeScript Lucid Agent that returns top headlines from newsapi.org and enforces x402-style payment at $0.001/request.

Built via TaskMarket bounty on taskmarket.xyz.

## Endpoint

`GET /headlines?category=technology&count=5`

Response shape:

```json
{
  "articles": [
    {
      "title": "Example title",
      "source": "Example source",
      "url": "https://example.com/article",
      "publishedAt": "2026-01-01T00:00:00Z"
    }
  ]
}
```

Valid categories:
- business
- technology
- science
- health
- sports
- entertainment

## x402 payment behavior

- Missing/invalid payment header -> `402 Payment Required`
- Valid payment header -> `200 OK`

Accepted payment header names:
- `x402-payment` (preferred)
- `x-payment`
- `payment`

Supported validation modes:
1. `@lucid-agents/payments` verifier (if available in your local package version)
2. Static token shortcut via `X402_VALID_PAYMENT_HEADER`
3. Built-in signed header format:
   `v1:<unix_ts>:<nonce>:<hmac_sha256_hex>`

HMAC payload format:
`<METHOD>:<PATH_WITH_QUERY>:<PRICE_USD>:<unix_ts>:<nonce>`

## Local run

```bash
cd apps/news-headlines-agent
cp .env.example .env
# Set NEWS_API_KEY and X402_SECRET in .env
bun install
bun run dev
```

## Production start

```bash
bun run start
```

## Deployment notes

A Dockerfile is included. Set these environment variables on your host:
- `NEWS_API_KEY`
- `X402_SECRET`
- `X402_PRICE_USD` (default `0.001`)
- `PORT` (platform-provided or `3000`)
- optional `X402_VALID_PAYMENT_HEADER`