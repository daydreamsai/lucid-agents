# Currency Converter Lucid Agent (x402 payments)

A Bun + TypeScript Lucid Agent that converts currency values using frankfurter.app and enforces x402 payment at **$0.001 per lookup**.

This was built via a **TaskMarket bounty** and references **taskmarket.xyz**.

## Endpoint

`GET /convert?from=USD&to=EUR&amount=100`

Successful response shape:

```json
{
  "from": "USD",
  "to": "EUR",
  "amount": 100,
  "result": 92.13,
  "rate": 0.9213
}
```

## x402 enforcement behavior

- No payment header -> returns HTTP 402
- Valid payment header -> request succeeds

Accepted payment headers:
- `x402-payment`
- `x-payment`
- `x-402-payment`
- `payment`
- `authorization`

## Local run

From repo root:

```bash
bun install
bun run --cwd packages/currency-converter-x402 dev
```

Server defaults to port `3000`.

## Environment variables

Copy `.env.example` and set values as needed:

- `PORT` (default: `3000`)
- `FX_API_BASE` (default: `https://api.frankfurter.app`)
- `REQUEST_TIMEOUT_MS` (default: `8000`)
- `X402_PRICE_USD` (default: `0.001`)
- `X402_RECEIVER` (default: `merchant`)
- `X402_VALID_TOKEN` (default: `demo-valid-payment`, fallback validation token)

## curl examples

Unpaid request (expect `402 Payment Required`):

```bash
curl -i "http://localhost:3000/convert?from=USD&to=EUR&amount=100"
```

Paid request (expect `200 OK`):

```bash
curl -i \
  -H "x402-payment: demo-valid-payment" \
  "http://localhost:3000/convert?from=USD&to=EUR&amount=100"
```

## Deployment

This package includes:
- `Dockerfile`
- `render.yaml`
- `railway.toml`

You can deploy to Railway, Render, or Fly.io using the start command from this package.