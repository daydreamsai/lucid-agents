# Task Deliverable — Weather Lucid Agent (x402)

- GitHub repo URL: https://github.com/daydreamsai/lucid-agents
- Live endpoint URL: LIVE_ENDPOINT_URL

## curl examples

### 1) 402 response (missing payment)

```bash
curl -i "$LIVE_ENDPOINT_URL/weather?city=Sydney"
```

Example response:

```http
HTTP/1.1 402 Payment Required
content-type: application/json; charset=utf-8

{"error":"missing_payment_header","protocol":"x402","amount_usd":0.001,"required_header":"x-payment","message":"Payment required. Send a valid x402 payment token in x-payment header."}
```

### 2) Successful paid response

```bash
curl -i "$LIVE_ENDPOINT_URL/weather?city=Sydney" \
  -H "x-payment: dev-paid-token"
```

Example response:

```http
HTTP/1.1 200 OK
content-type: application/json; charset=utf-8

{"city":"Sydney","temp_c":24,"condition":"Partly cloudy","humidity":61}
```

Built via TaskMarket bounty (taskmarket.xyz).