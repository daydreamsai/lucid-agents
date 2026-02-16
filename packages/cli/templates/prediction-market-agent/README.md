## Prediction Market Agent

AI agent that reads and trades on-chain Solana prediction markets ([Baozi](https://baozi.bet)). Fetches live market data directly from the blockchain with zero backend dependency.

### Quick Start

```sh
bunx @lucid-agents/create-agent-kit my-pm-agent --template=prediction-market-agent --adapter=hono
cd my-pm-agent
# Edit .env with your Solana RPC URL
bun run dev
```

### Entrypoints

- **`getMarkets`** — List active prediction markets with current odds
  - Parameters: `status` (active/closed/all), `query` (search), `limit`

- **`getMarketOdds`** — Implied probabilities and pool sizes for a market
  - Parameters: `marketId` (base58 public key)

- **`getPortfolio`** — View positions for a wallet
  - Parameters: `wallet` (base58 address)

- **`placeBet`** — Place a bet on a market outcome (requires `SOLANA_PRIVATE_KEY`)
  - Parameters: `marketId`, `outcome` (index), `amountSol` (0.01–100)

- **`analyzeMarket`** — Statistical summary with odds breakdown
  - Parameters: `marketId`

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SOLANA_RPC_URL` | Yes | Solana RPC endpoint (mainnet or devnet) |
| `SOLANA_PRIVATE_KEY` | For trading | Base58-encoded wallet private key |
| `DEFAULT_PRICE` | No | x402 price per entrypoint call (base units) |

### Testing

```sh
# List active markets
curl -X POST http://localhost:3000/entrypoints/getMarkets/invoke \
  -H "Content-Type: application/json" \
  -d '{"input": {"status": "active", "limit": 5}}'

# Get odds for a specific market
curl -X POST http://localhost:3000/entrypoints/getMarketOdds/invoke \
  -H "Content-Type: application/json" \
  -d '{"input": {"marketId": "YOUR_MARKET_PUBKEY"}}'

# View portfolio
curl -X POST http://localhost:3000/entrypoints/getPortfolio/invoke \
  -H "Content-Type: application/json" \
  -d '{"input": {"wallet": "YOUR_WALLET_ADDRESS"}}'

# Agent card
curl http://localhost:3000/.well-known/agent-card.json
```

### How It Works

The agent reads prediction market data directly from the Solana blockchain using `getProgramAccounts` RPC calls. Market data is parsed from on-chain Borsh-serialized account data — no indexer or backend API required.

**Pricing model:** Pari-mutuel (pool-based). Odds are derived from pool ratios: the implied probability of an outcome equals the proportion of funds bet on the *other* side(s).

See `AGENTS.md` for detailed implementation guide.
