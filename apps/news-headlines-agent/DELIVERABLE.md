# Deliverable — News Headlines Lucid Agent (x402)

- GitHub repo URL: https://github.com/daydreamsai/lucid-agents
- Live endpoint URL: LIVE_ENDPOINT_URL

Built via TaskMarket bounty on taskmarket.xyz.

## curl examples

### 1) Unpaid request (expect 402)

```bash
curl -i "LIVE_ENDPOINT_URL/headlines?category=technology&count=5"
```

### 2) Paid request (expect 200)

If using static token mode (`X402_VALID_PAYMENT_HEADER` set on server), send:

```bash
curl -i \
  -H "x402-payment: VALID_PAYMENT_HEADER" \
  "LIVE_ENDPOINT_URL/headlines?category=technology&count=5"
```

If using signed mode, generate a valid header:

```bash
TS=$(date +%s)
NONCE=$(openssl rand -hex 8)
PAYLOAD="GET:/headlines?category=technology&count=5:0.001:${TS}:${NONCE}"
SIG=$(printf "%s" "$PAYLOAD" | openssl dgst -sha256 -hmac "$X402_SECRET" -hex | sed 's/^.* //')
HDR="v1:${TS}:${NONCE}:${SIG}"

curl -i \
  -H "x402-payment: ${HDR}" \
  "LIVE_ENDPOINT_URL/headlines?category=technology&count=5"
```