## Prediction Market Agent

AI agent that reads and trades on-chain Solana prediction markets ([Baozi](https://baozi.bet)). Fetches live market data directly from the blockchain with zero backend dependency. Supports reading all market layers and creating community (Lab) markets.

### Quick Start

```sh
bunx @lucid-agents/create-agent-kit my-pm-agent --template=prediction-market-agent --adapter=hono
cd my-pm-agent
# Edit .env with your Solana RPC URL
bun run dev
```

### Market Layers

Baozi has three market layers with different trust levels and permissions:

| Layer | Who Can Create | Platform Fee | Description |
|-------|---------------|-------------|-------------|
| **Official** | Admin only | 2.5% | Highest trust — created by protocol team |
| **Lab** | Anyone with CreatorProfile | 3% | Community-created markets |
| **Private** | Anyone with CreatorProfile | 2% | Invite-only, whitelist access |

This agent can **read and bet on all layers**, but can only **create** Lab markets (Official is admin-only, Private requires whitelist setup).

### Entrypoints

#### Read (no wallet required)

- **`getMarkets`** — List active prediction markets with current odds
  - Parameters: `status` (active/closed/all), `layer` (official/lab/private/all), `query` (search), `limit`

- **`getMarketOdds`** — Implied probabilities and pool sizes for a market
  - Parameters: `marketId` (base58 public key)

- **`getPortfolio`** — View positions for a wallet
  - Parameters: `wallet` (base58 address)

- **`analyzeMarket`** — Statistical summary with odds breakdown
  - Parameters: `marketId`

#### Write (requires `SOLANA_PRIVATE_KEY`)

- **`placeBet`** — Place a bet on any market outcome
  - Parameters: `marketId`, `outcome` (index), `amountSol` (0.01–100)

- **`createCreatorProfile`** — Create an on-chain creator profile (required before creating markets)
  - Parameters: `displayName` (1–32 chars), `defaultFeeBps` (optional, default 50 = 0.5%)

- **`createLabMarket`** — Create a boolean (Yes/No) Lab prediction market
  - Parameters: `question` (10–200 chars), `closingTime` (ISO 8601)

- **`createLabRaceMarket`** — Create a multi-outcome Lab race market (2–10 outcomes)
  - Parameters: `question`, `closingTime`, `outcomes` (array of labels)

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SOLANA_RPC_URL` | Yes | Solana RPC endpoint (use Helius, QuickNode — not public RPC) |
| `SOLANA_PRIVATE_KEY` | For trading/creating | Base58-encoded wallet private key |
| `DEFAULT_PRICE` | No | x402 price per entrypoint call (base units) |

### Testing

```sh
# List active markets (all layers)
curl -X POST http://localhost:3000/entrypoints/getMarkets/invoke \
  -H "Content-Type: application/json" \
  -d '{"input": {"status": "active", "limit": 5}}'

# List only Lab markets
curl -X POST http://localhost:3000/entrypoints/getMarkets/invoke \
  -H "Content-Type: application/json" \
  -d '{"input": {"status": "active", "layer": "lab", "limit": 10}}'

# Get odds for a specific market
curl -X POST http://localhost:3000/entrypoints/getMarketOdds/invoke \
  -H "Content-Type: application/json" \
  -d '{"input": {"marketId": "YOUR_MARKET_PUBKEY"}}'

# Create a creator profile (one-time setup)
curl -X POST http://localhost:3000/entrypoints/createCreatorProfile/invoke \
  -H "Content-Type: application/json" \
  -d '{"input": {"displayName": "My Agent", "defaultFeeBps": 50}}'

# Create a Lab market
curl -X POST http://localhost:3000/entrypoints/createLabMarket/invoke \
  -H "Content-Type: application/json" \
  -d '{"input": {"question": "Will ETH flip BTC by end of 2026?", "closingTime": "2026-12-31T23:59:59Z"}}'

# Create a Lab race market
curl -X POST http://localhost:3000/entrypoints/createLabRaceMarket/invoke \
  -H "Content-Type: application/json" \
  -d '{"input": {"question": "Who will win the 2026 NBA MVP?", "closingTime": "2026-06-30T00:00:00Z", "outcomes": ["Luka", "Jokic", "Giannis", "Shai"]}}'

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

**Market creation flow:**
1. Create a CreatorProfile (one-time, costs ~0.01 SOL rent)
2. Create a Lab market with a question and closing time
3. The market goes live immediately — anyone can bet on it
4. After closing, the oracle resolves the outcome
5. Winners claim their winnings (minus 3% platform fee)

See `AGENTS.md` for detailed implementation guide.
