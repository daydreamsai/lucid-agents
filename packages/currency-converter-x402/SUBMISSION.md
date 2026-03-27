# TaskMarket Bounty Submission

- GitHub repo URL: https://github.com/daydreamsai/lucid-agents
- Live endpoint URL: <DEPLOYED_ENDPOINT_URL>

## curl example (402 response)

```bash
curl -i "<DEPLOYED_ENDPOINT_URL>/convert?from=USD&to=EUR&amount=100"
```

Expected status: `402 Payment Required`

## curl example (successful paid response)

```bash
curl -i \
  -H "x402-payment: demo-valid-payment" \
  "<DEPLOYED_ENDPOINT_URL>/convert?from=USD&to=EUR&amount=100"
```

Expected status: `200 OK`

## Note

Built via TaskMarket bounty (taskmarket.xyz).