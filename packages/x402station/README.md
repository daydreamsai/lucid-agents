# `@lucid-agents/x402station`

Pre-flight oracle client for x402 endpoints. Wraps the public oracle at [x402station.io](https://x402station.io) — six methods covering safety checks, deep history, blacklist pulls, and webhook subscriptions on endpoint state changes.

## Why pre-flight?

The agentic.market catalog has 25,000+ x402 endpoints. A non-trivial fraction are honeypots:

- **Decoys** priced ≥ $1,000 USDC per call. An agent that pays one drains its wallet.
- **Zombies** that 402-handshake fine but always 4xx after settlement (the payment goes through, the agent gets nothing).
- **Dead** endpoints that return network errors or 5xx every probe.

x402station independently probes every active catalog endpoint every ~10 minutes (not facilitator-reported) so it surfaces what facilitator-only monitors miss. Calling `preflight` before each paid x402 request costs $0.001 USDC — typically **20× cheaper than the request the agent would otherwise lose to a decoy**.

## Install

```bash
bun add @lucid-agents/x402station
```

## Quick start

```ts
import { x402Station } from "@lucid-agents/x402station";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`);
const oracle = x402Station({ account });

const target = "https://api.venice.ai/api/v1/chat/completions";

const { result, paymentReceipt } = await oracle.preflight({ url: target });
if (!result.ok) {
  // refuse — result.warnings tells you why (dead / zombie / decoy_price_extreme / ...)
  console.warn(`refusing ${target}:`, result.warnings);
  return;
}

// safe to commit a paid call to `target` from here.
console.info(`preflight cleared in $${paymentReceipt?.transaction ?? "?"}`);
```

## Methods

| Method | Cost | Returns |
|---|---|---|
| `preflight({ url })` | $0.001 | `{ ok, warnings, metadata }` — fast safety check |
| `forensics({ url })` | $0.001 | 7-day uptime + latency p50/p90/p99 + decoy probability + concentration stats |
| `catalogDecoys()` | $0.005 | Full known-bad blacklist as one cacheable JSON |
| `watch.subscribe({ url, webhookUrl, signals? })` | $0.01 | 30-day webhook subscription + 100 prepaid HMAC-signed alerts |
| `watch.status({ watchId, secret })` | free* | Read-back: active/expired, alerts remaining, recent deliveries |
| `watch.unsubscribe({ watchId, secret })` | free* | Soft-delete a watch |

\* Free methods are secret-gated by the 64-char hex secret returned from `watch.subscribe`. Constant-time compare on the server; mismatched secret returns 404 (not 401) so an attacker scraping IDs can't distinguish "exists but wrong secret" from "doesn't exist".

Paid methods return `{ result, paymentReceipt }` so the agent can audit on-chain spend; free methods return the parsed body directly.

## Signal vocabulary

Strings returned in `warnings[]` from `preflight` / `forensics`. **Bold** signals flip `ok` to `false` and an agent should refuse the target call:

- **`dead`** — ≥3 unhealthy probes in the last 30 min
- **`zombie`** — ≥3 probes in the last hour, zero healthy
- **`decoy_price_extreme`** — listed price ≥ $1,000 USDC
- **`dead_7d`** — ≥20 probes over 7 days, zero healthy (forensics-only)
- **`mostly_dead`** — ≥20 probes over 7 days, uptime < 50% (forensics-only)
- `unknown_endpoint` — URL not in the catalog (informational; still billed)
- `no_history` — in catalog but no probes in the last hour
- `suspicious_high_price` — price $10–$1,000 USDC
- `slow` — avg latency ≥ 2,000 ms in the last hour
- `new_provider` — service first seen < 24h ago
- `slow_p99` — latency p99 ≥ 5,000 ms (forensics-only)
- `price_outlier_high` — current price > 10× provider-group median
- `high_concentration` — endpoint's provider owns ≥ 5% of the catalog

`watch.subscribe`'s `signals` array accepts a subset of these — the worker fires when subscribed signals appear or clear vs the last computed state.

## Networks

- **Base mainnet** (`eip155:8453`) — production
- **Base Sepolia** (`eip155:84532`) — testing

The oracle accepts USDC payments on both via Coinbase's CDP facilitator. The constructor's `baseUrl` is allow-listed: only `https://x402station.io` (canonical) or any `http(s)://localhost*` (development) is accepted; any other host throws so a misconfigured agent can't sign payments against an unknown URL.

## Composition with adapters

`@lucid-agents/x402station` is a plain client — drop it into any Hono / Express / TanStack route handler that already has access to the agent's `X402Account`:

```ts
// packages/hono adapter example
import { x402Station } from "@lucid-agents/x402station";

app.post("/agent/spend", async (c) => {
  const oracle = x402Station({ account });
  const { url } = await c.req.json();

  const { result } = await oracle.preflight({ url });
  if (!result.ok) {
    return c.json({ refused: true, reasons: result.warnings }, 400);
  }
  // … proceed with the actual paid call to `url`
});
```

## Links

- Service: <https://x402station.io>
- Manifest: <https://x402station.io/.well-known/x402>
- OpenAPI: <https://x402station.io/api/openapi.json>
- Public client SDKs (MCP adapter, AgentKit action provider, demo agent): <https://github.com/sF1nX/x402station-mcp>
- Contact: [hello@x402station.io](mailto:hello@x402station.io)
- Security disclosures (RFC 9116): <https://x402station.io/.well-known/security.txt>

## License

MIT.
