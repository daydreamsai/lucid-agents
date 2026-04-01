# TaskMarket Submission: News Headlines Lucid Agent (x402)

Built via TaskMarket bounty at taskmarket.xyz.

## 1) GitHub repo URL
https://github.com/daydreamsai/lucid-agents

## 2) Live endpoint URL
<DEPLOYED_LIVE_ENDPOINT_URL>

## 3) curl examples

### 402 (no payment)
```bash
curl -i "<DEPLOYED_LIVE_ENDPOINT_URL>/headlines?category=technology&count=5"
```

Expected status:
```http
HTTP/1.1 402 Payment Required
```

### Successful paid response
```bash
curl -i \
  -H "x402-payment: paid-demo-token" \
  "<DEPLOYED_LIVE_ENDPOINT_URL>/headlines?category=technology&count=5"
```

Expected status:
```http
HTTP/1.1 200 OK
```

Expected body shape:
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