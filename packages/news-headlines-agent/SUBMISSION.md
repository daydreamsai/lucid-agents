# TaskMarket Submission — News Headlines Lucid Agent (x402)

- GitHub repo URL: https://github.com/daydreamsai/lucid-agents
- Live endpoint URL: <DEPLOYED_BASE_URL>

Built via TaskMarket bounty on taskmarket.xyz.

## curl example: 402 response

```bash
curl -i "<DEPLOYED_BASE_URL>/headlines?category=technology&count=5"
```

Expected: `HTTP/1.1 402 Payment Required`

## curl example: successful paid response

```bash
curl -i \
  -H "x402-payment: taskmarket-demo-paid" \
  "<DEPLOYED_BASE_URL>/headlines?category=technology&count=5"
```

Expected: `HTTP/1.1 200 OK` with JSON payload:

```json
{
  "articles": [
    {
      "title": "...",
      "source": "...",
      "url": "...",
      "publishedAt": "..."
    }
  ]
}
```