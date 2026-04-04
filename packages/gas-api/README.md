# @lucid-agents/gas-api

Paid API for chain-specific fee recommendations with inclusion probability by latency target.

## Endpoints

1. `GET /v1/gas/quote`
2. `GET /v1/gas/forecast`
3. `GET /v1/gas/congestion`

## Authentication / Payment

This API is designed as a paid API. By default, the package supports:

- API-key style payment (`x-lucid-api-key`)
- AP2-style receipt header (`x-ap2-receipt`) via Lucid packages when available

If payment verification fails, the API returns `402`.

## Query Parameters

### `GET /v1/gas/quote`

- `chain` (required): chain key, e.g. `ethereum`, `polygon`, `arbitrum`, `base`
- `latency` (optional): `instant | fast | standard | economy` (default: `standard`)

### `GET /v1/gas/forecast`

- `chain` (required)
- `horizons` (optional): comma-separated block horizons, e.g. `1,2,4,8`
- `targets` (optional): comma-separated latency targets, e.g. `fast,standard,economy`

### `GET /v1/gas/congestion`

- `chain` (required)

## Response Highlights

- Quote/forecast include:
  - base fee estimate
  - recommended max priority fee
  - recommended max fee
  - inclusion probability
  - expected inclusion seconds

- Congestion includes:
  - congestion score (0-100)
  - level (`low | moderate | high | extreme`)
  - pending transaction signal
  - gas usage ratio
  - base fee trend

## Freshness

Snapshots older than configured freshness window (default: 30s) return:

- HTTP status `503`
- error code `STALE_DATA`

## Buyer Integration Notes

1. Send payment material (`x-lucid-api-key` and/or AP2 proof material configured by your seller).
2. Select your latency target based on urgency:
   - `instant`: highest inclusion probability, higher recommended fee
   - `fast`: high probability
   - `standard`: balanced default
   - `economy`: cost-sensitive
3. Use `forecast` for multi-block strategy and `congestion` for dynamic policy switching.

## Programmatic Usage

```ts
import {
  GasApi,
  InMemoryGasSnapshotSource,
  StaticApiKeyPaymentVerifier
} from "@lucid-agents/gas-api";

const source = new InMemoryGasSnapshotSource();
source.set({
  chain: "ethereum",
  timestamp: Date.now(),
  blockNumber: 22000000,
  baseFeePerGasGwei: 28,
  priorityFeeP50Gwei: 1.0,
  priorityFeeP75Gwei: 1.6,
  priorityFeeP90Gwei: 2.4,
  priorityFeeP99Gwei: 4.2,
  pendingTx: 120000,
  gasUsedRatio: 0.92,
  baseFeeTrend: 0.35
});

const api = new GasApi({
  source,
  paymentVerifier: new StaticApiKeyPaymentVerifier({ apiKey: "seller-key" })
});

const response = await api.handle({
  method: "GET",
  url: "/v1/gas/quote?chain=ethereum&latency=fast",
  headers: { "x-lucid-api-key": "seller-key" }
});

console.log(response.status, response.body);
```