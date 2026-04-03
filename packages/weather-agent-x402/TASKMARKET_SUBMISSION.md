# TaskMarket Submission — Weather Lucid Agent (x402)

- GitHub repo URL: https://github.com/daydreamsai/lucid-agents
- Live endpoint URL: <LIVE_ENDPOINT_URL>

## curl example: 402 response (no payment)

```bash
curl -i "<LIVE_ENDPOINT_URL>/weather?city=Sydney"
```

Example response:
```http
HTTP/1.1 402 Payment Required
content-type: application/json; charset=utf-8
x402-price-usd: 0.001

{"error":"payment_required","message":"x402 payment required for this endpoint","required":{"amount_usd":0.001,"route":"GET /weather","header":"x-payment"}}
```

## curl example: successful paid response

```bash
curl -i -H "x-payment: dev-test-payment-token" "<LIVE_ENDPOINT_URL>/weather?city=Sydney"
```

Example response:
```http
HTTP/1.1 200 OK
content-type: application/json; charset=utf-8

{"city":"Sydney","temp_c":24.3,"condition":"Partly cloudy","humidity":58}
```