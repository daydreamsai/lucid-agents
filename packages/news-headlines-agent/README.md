# News Headlines Lucid Agent (x402 payments)

Built via TaskMarket bounty for taskmarket.xyz.

This package provides a Bun + TypeScript Lucid Agent that returns top headlines from newsapi.org and enforces x402-style payment at $0.001/request.

## Endpoint

`GET /headlines?category=technology&count=5`

Response shape:

```json
{
  "articles": [
    {
      "title": "Some headline",
      "source": "Source Name",
      "url": "https://...",
      "publishedAt": "2026-03-06T10:00:00Z"
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

## Payment enforcement

`/headlines` is paywalled:
- No valid payment header -> HTTP 402
- Valid payment header -> HTTP 200 + headlines

Accepted headers:
- `x402-payment: <token>`
- `x-payment: <token>`
- `authorization: Bearer <token>`

Default token for local/dev demo: `taskmarket-demo-paid` (override with `X402_VALID_TOKEN`).

## Run locally

```bash
cd packages/news-headlines-agent
bun install
cp .env.example .env
# set NEWS_API_KEY in .env
bun run dev
```

## Deploy (Railway / Render / Fly.io)

Use this package folder as the service root.
- Build/install: `bun install`
- Start command: `bun run start`
- Set environment variable: `NEWS_API_KEY=<your_newsapi_key>`
- Optional: `X402_VALID_TOKEN=<your_token>`

## curl examples

Unpaid request (402):

```bash
curl -i "http://localhost:3000/headlines?category=technology&count=5"
```

Paid request (200):

```bash
curl -i \
  -H "x402-payment: taskmarket-demo-paid" \
  "http://localhost:3000/headlines?category=technology&count=5"
```