# News Headlines Lucid Agent (x402)

Built via a TaskMarket bounty at taskmarket.xyz.

This package provides a Bun + TypeScript Lucid Agent that:
- Uses `@lucid-agents/http` and `@lucid-agents/payments`.
- Exposes `GET /headlines?category=technology&count=5`.
- Enforces x402-style payment with HTTP `402` when payment is missing.
- Returns top headlines from newsapi.org free tier in this format:
  - `{ "articles": [{ "title", "source", "url", "publishedAt" }] }`

## Valid categories
- business
- technology
- science
- health
- sports
- entertainment

## Setup
1. Copy `.env.example` to `.env`.
2. Set `NEWSAPI_KEY`.
3. Run:
   - `bun install`
   - `bun run dev`

## API behavior

### Unpaid request
`GET /headlines?category=technology&count=5` without payment header returns:
- `402 Payment Required`
- JSON body with payment details

### Paid request
Send a valid payment header:
- Header name: `x402-payment`
- Header value: `X402_TEST_TOKEN` from env (default: `paid-demo-token`)

Then the same request returns:
- `200 OK`
- `{ "articles": [...] }`

## curl examples
```bash
curl -i "<LIVE_ENDPOINT_URL>/headlines?category=technology&count=5"
```

```bash
curl -i \
  -H "x402-payment: paid-demo-token" \
  "<LIVE_ENDPOINT_URL>/headlines?category=technology&count=5"
```

## Notes
- Uses `https://newsapi.org/v2/top-headlines`.
- Free-tier NewsAPI key is supported via `NEWSAPI_KEY`.