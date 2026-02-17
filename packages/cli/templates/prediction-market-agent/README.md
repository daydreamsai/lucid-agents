## Prediction Market Agent

AI agent that reads, trades, creates, and manages on-chain Solana prediction markets ([Baozi](https://baozi.bet)). Fetches live market data directly from the blockchain with zero backend dependency. Supports all market layers, community (Lab) market lifecycle, affiliate referrals, and creator reputation.

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

This agent can **read and bet on all layers**, and **create, manage, and resolve** Lab markets.

### Entrypoints (22 total)

#### Read (5 — no wallet required)

- **`getMarkets`** — List active prediction markets with current odds
  - Parameters: `status` (active/closed/all), `layer` (official/lab/private/all), `query` (search), `limit`

- **`getMarketOdds`** — Implied probabilities and pool sizes for a market
  - Parameters: `marketId` (base58 public key)

- **`getPortfolio`** — View positions for a wallet
  - Parameters: `wallet` (base58 address)

- **`analyzeMarket`** — Statistical summary with odds breakdown
  - Parameters: `marketId`

- **`getCreatorProfile`** — View creator profile, stats, earnings, and reputation
  - Parameters: `wallet` (base58 address)

#### Trading (2 — requires `SOLANA_PRIVATE_KEY`)

- **`placeBet`** — Place a bet on any market outcome (boolean or race)
  - Parameters: `marketId`, `outcome` (index), `amountSol` (0.01–100)

- **`placeBetWithAffiliate`** — Place a bet with affiliate referral tracking (1% commission to referrer)
  - Parameters: `marketId`, `outcome`, `amountSol`, `affiliateWallet`

#### Affiliate System (2)

- **`registerAffiliate`** — Register as an affiliate to earn 1% referral commission
  - Parameters: `code` (unique referral code, 1–32 chars)

- **`claimAffiliateEarnings`** — Claim accumulated affiliate SOL earnings
  - Parameters: none

#### Market Creation (3)

- **`createCreatorProfile`** — Create an on-chain creator profile (required before creating markets)
  - Parameters: `displayName` (1–32 chars), `defaultFeeBps` (optional, default 50 = 0.5%)

- **`createLabMarket`** — Create a boolean (Yes/No) Lab prediction market
  - Parameters: `question` (10–200 chars), `closingTime` (ISO 8601), `marketType` (event/measurement), `eventTime` or `measurementStart`+`measurementEnd`

- **`createLabRaceMarket`** — Create a multi-outcome Lab race market (2–10 outcomes)
  - Parameters: `question`, `closingTime`, `outcomes` (array of labels), `marketType`, `eventTime` or `measurementStart`+`measurementEnd`

#### Market Management (6)

- **`updateCreatorProfile`** — Update display name and default creator fee
  - Parameters: `displayName`, `defaultFeeBps`

- **`claimCreatorFees`** — Claim pending creator fee earnings from your markets
  - Parameters: none

- **`cancelLabMarket`** — Cancel a Lab market you created (full 100% refund to all bettors)
  - Parameters: `marketId`, `reason` (1–200 chars)

- **`closeMarket`** — Close a market after closing time (permissionless, takes pool snapshot)
  - Parameters: `marketId`

- **`proposeResolutionHost`** — Creator resolves own Lab boolean market (6h dispute window)
  - Parameters: `marketId`, `winningOutcome` (true=Yes, false=No)

- **`proposeRaceResolution`** — Creator resolves own Lab race market (6h dispute window)
  - Parameters: `marketId`, `winningOutcome` (outcome index)

#### Claims & Reputation (4)

- **`claimRefund`** — Claim your refund from a cancelled market
  - Parameters: `marketId`

- **`claimWinnings`** — Claim SOL winnings from a resolved market (boolean or race)
  - Parameters: `marketId`

- **`finalizeResolution`** — Finalize resolution after 6h dispute window (permissionless)
  - Parameters: `marketId`

- **`voteCreatorReputation`** — Vote +1/-1 on creator reputation for boolean markets only (requires bet position)
  - Parameters: `marketId`, `vote` (+1 or -1)

### Affiliate System — Agent-to-Agent Recruitment

Agents can earn passive income by referring other agents and users to bet on markets:

```text
Agent A (affiliate)          Agent B (bettor)
    │                            │
    ├── registerAffiliate ──►    │
    │   (code: "agent-a")        │
    │                            │
    │   Shares wallet address    │
    │   ─────────────────────►   │
    │                            ├── placeBetWithAffiliate
    │                            │   (affiliateWallet: Agent A)
    │                            │
    │   ... Agent B wins ...     │
    │                            ├── claimWinnings
    │   1% commission accrues    │   (3% platform fee)
    │   ◄────────────────────    │
    │                            │
    ├── claimAffiliateEarnings   │
    │   (collects 1% SOL)        │
```

Commission comes from the platform fee split — bettors pay the same amount.

### Fee Structure

| Layer | Platform Fee | Creator Cut | Affiliate Cut | Protocol |
|-------|-------------|-------------|---------------|----------|
| Official | 2.5% | 0.5% | 1.0% | 1.0% |
| Lab | 3.0% | 0.5% | 1.0% | 1.5% |
| Private | 2.0% | 0.5% | 1.0% | 0.5% |

**Solvency rule:** `creator_fee + affiliate_fee <= platform_fee`

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

# Register as affiliate
curl -X POST http://localhost:3000/entrypoints/registerAffiliate/invoke \
  -H "Content-Type: application/json" \
  -d '{"input": {"code": "my-agent"}}'

# Bet with affiliate tracking
curl -X POST http://localhost:3000/entrypoints/placeBetWithAffiliate/invoke \
  -H "Content-Type: application/json" \
  -d '{"input": {"marketId": "MARKET_PUBKEY", "outcome": 0, "amountSol": 0.1, "affiliateWallet": "AFFILIATE_WALLET"}}'

# Claim affiliate earnings
curl -X POST http://localhost:3000/entrypoints/claimAffiliateEarnings/invoke \
  -H "Content-Type: application/json" \
  -d '{"input": {}}'

# View creator profile
curl -X POST http://localhost:3000/entrypoints/getCreatorProfile/invoke \
  -H "Content-Type: application/json" \
  -d '{"input": {"wallet": "CREATOR_WALLET"}}'

# Close market after closing time
curl -X POST http://localhost:3000/entrypoints/closeMarket/invoke \
  -H "Content-Type: application/json" \
  -d '{"input": {"marketId": "MARKET_PUBKEY"}}'

# Creator resolves own boolean Lab market
curl -X POST http://localhost:3000/entrypoints/proposeResolutionHost/invoke \
  -H "Content-Type: application/json" \
  -d '{"input": {"marketId": "MARKET_PUBKEY", "winningOutcome": true}}'

# Creator resolves own race Lab market
curl -X POST http://localhost:3000/entrypoints/proposeRaceResolution/invoke \
  -H "Content-Type: application/json" \
  -d '{"input": {"marketId": "MARKET_PUBKEY", "winningOutcome": 2}}'

# Vote on creator reputation
curl -X POST http://localhost:3000/entrypoints/voteCreatorReputation/invoke \
  -H "Content-Type: application/json" \
  -d '{"input": {"marketId": "RESOLVED_MARKET_PUBKEY", "vote": 1}}'

# Agent card
curl http://localhost:3000/.well-known/agent-card.json
```

### How It Works

The agent reads prediction market data directly from the Solana blockchain using `getProgramAccounts` RPC calls. Market data is parsed from on-chain Borsh-serialized account data — no indexer or backend API required.

**Pricing model:** Pari-mutuel (pool-based). `P(outcome) = pool_for_outcome / total_pool`.

**Full market lifecycle (all steps supported by this agent):**
1. Create a CreatorProfile (one-time, costs ~0.01 SOL rent)
2. Register as affiliate (optional, to earn referral commissions)
3. Create a Lab market with a question, closing time, and timing proof (Type A or B)
4. The market goes live — anyone can bet (with or without affiliate tracking)
5. Creator can cancel before resolution if needed (full 100% refund)
6. After closing time, call `closeMarket` (permissionless) to take snapshot
7. Creator calls `proposeResolutionHost` / `proposeRaceResolution` (6h dispute window)
8. Anyone calls `finalizeResolution` after dispute window closes
9. Winners call `claimWinnings`, creator calls `claimCreatorFees`, affiliates call `claimAffiliateEarnings`
10. Bettors vote on creator reputation with `voteCreatorReputation`

**Parimutuel Rules v6.3:** Every market creation is validated against strict timing and content rules before the on-chain transaction is sent.

See `AGENTS.md` for detailed implementation guide.
