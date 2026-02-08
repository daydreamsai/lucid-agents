## Trading Data Agent

This agent provides mock trading data via priced entrypoints. Other agents can buy this data using A2A (Agent-to-Agent) calls with x402 payments.

### Quick Start

```sh
bunx @lucid-agents/create-agent-kit data-agent --template=trading-data-agent --adapter=hono
cd data-agent
# Set PAYMENTS_RECEIVABLE_ADDRESS in .env
bun run dev
```

### Entrypoints

- **`getMarketData`** - Returns full OHLCV (Open/High/Low/Close/Volume) data
  - Price: 5000 base units
  - Parameters: `symbol` (string), `timeframe` (optional: '1h', '4h', '1d')

- **`getPrice`** - Returns current price only
  - Price: 1000 base units
  - Parameters: `symbol` (string)

### Environment Variables

- `PAYMENTS_FACILITATOR_URL` - x402 facilitator endpoint
- `PAYMENTS_FACILITATOR_AUTH` - Optional facilitator bearer token (defaults to `DREAMS_AUTH_TOKEN` at runtime)
- `PAYMENTS_NETWORK` - Payment network (base-sepolia, base, solana-devnet, solana)
- `PAYMENTS_RECEIVABLE_ADDRESS` - Address that receives payments

### Testing

Test the agent locally:

```sh
curl -X POST http://localhost:3000/entrypoints/getPrice/invoke \
  -H "Content-Type: application/json" \
  -d '{"input": {"symbol": "BTC/USD"}}'
```

### Use with Recommendation Agent

This agent is designed to work with the `trading-recommendation-agent` template, which buys data from this agent and generates trading signals.

See `AGENTS.md` for detailed implementation guide.
