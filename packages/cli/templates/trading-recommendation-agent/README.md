## Trading Recommendation Agent

This agent buys trading data from a data agent and generates trading signals/recommendations. It demonstrates A2A (Agent-to-Agent) composition with payment-enabled calls.

### Quick Start

```sh
bunx @lucid-agents/cli recommendation-agent --template=trading-recommendation-agent --adapter=hono
cd recommendation-agent
# Set AGENT_WALLET_PRIVATE_KEY and DATA_AGENT_URL in .env
bun run dev
```

### Prerequisites

You need a running data agent (created with `trading-data-agent` template) that this agent will buy data from.

### Entrypoints

- **`generateSignal`** - Buys market data and generates trading signal
  - Parameters: `symbol` (string), `strategy` (optional: 'momentum', 'mean-reversion', 'breakout')
  - Returns: signal (BUY/SELL/HOLD), confidence, reasoning, dataPrice

- **`quickSignal`** - Quick signal using price data only (cheaper)
  - Parameters: `symbol` (string)
  - Returns: signal (BUY/SELL/HOLD), price

### Environment Variables

- `DATA_AGENT_URL` - URL of the data agent (default: http://localhost:3001)
- `AGENT_WALLET_PRIVATE_KEY` - Wallet private key (pays for data)
- `PAYMENTS_NETWORK` - Payment network (must match data agent: base-sepolia, base, solana-devnet, solana)

### Testing

1. Start the data agent first (on port 3001)
2. Start this recommendation agent (on port 3000)
3. Call the recommendation agent:

```sh
curl -X POST http://localhost:3000/entrypoints/generateSignal/invoke \
  -H "Content-Type: application/json" \
  -d '{"input": {"symbol": "BTC/USD", "strategy": "momentum"}}'
```

The agent will automatically pay the data agent for the market data.

### How It Works

1. Agent needs data → calls data agent's `getMarketData` entrypoint
2. Uses payment-enabled fetch → automatically pays via x402
3. Data agent validates payment → processes request and returns data
4. Agent analyzes data → generates trading signal

See `AGENTS.md` for detailed implementation guide.

