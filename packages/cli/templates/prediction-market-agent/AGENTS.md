# Prediction Market Agent - AI Implementation Guide

This template creates an agent that reads, trades, and creates on-chain Solana prediction markets via the Baozi protocol.

## Architecture

**Data Source:** Solana blockchain (program `FWyTPzm5cfJwRKzfkscxozatSxF6Qu78JQovQUwKPruJ`)
**Parsing:** Direct Borsh deserialization from on-chain account data
**Pricing:** Pari-mutuel (pool-based implied probabilities)
**Caching:** 30-second TTL for market list queries
**Dependencies:** `@solana/web3.js`, `bs58` only

## Key Concepts

### 1. Market Layers

Baozi has three market layers — this is a core concept for understanding the protocol:

| Layer | Value | Who Creates | Fee | Resolution | Description |
|-------|-------|------------|-----|------------|-------------|
| **Official** | 0 | Admin/Guardian **only** | 2.5% | BaoziTvs (oracle) | Protocol-managed, highest trust |
| **Lab** | 1 | Anyone with CreatorProfile | 3% | HostOracle | Community-created, open access |
| **Private** | 2 | Anyone with CreatorProfile | 2% | Creator or Oracle | Invite-only, whitelist gated |

**Important:** Official markets (`create_market_sol`) can only be created by the protocol admin. This agent exposes Lab market creation (`create_lab_market_sol`) which is permissionless — anyone with a CreatorProfile can create them.

### 2. On-Chain Data Reading

All market data is fetched via `getProgramAccounts` with discriminator filters:

```typescript
// Boolean markets (YES/NO)
connection.getProgramAccounts(PROGRAM_ID, {
  filters: [{ memcmp: { offset: 0, bytes: MARKET_DISCRIMINATOR_BS58 } }],
});

// Race markets (multi-outcome)
connection.getProgramAccounts(PROGRAM_ID, {
  filters: [{ memcmp: { offset: 0, bytes: RACE_MARKET_DISCRIMINATOR_BS58 } }],
});
```

Account data is parsed using a cursor-based `BorshReader` that walks through the binary layout field by field. A `BorshWriter` serializes instruction data for transactions.

### 3. Pari-Mutuel Pricing

Unlike order-book markets, pari-mutuel markets determine payouts from pool ratios:

- **Boolean market:** P(Yes) = noPool / totalPool, P(No) = yesPool / totalPool
- **Race market:** Probabilities normalized across all outcome pools
- **Payout if correct:** totalPool / winningOutcomePool (minus fees)

### 4. Market Types

| Type | Outcomes | PDA Seed | Pool Structure |
|------|----------|----------|----------------|
| Boolean | 2 (Yes/No) | `"market"` | yesPool + noPool |
| Race | 2–10 | `"race"` | outcomePools[10] array |

### 5. PDA Seeds Reference

All Program Derived Addresses used by this agent:

| PDA | Seeds | Used For |
|-----|-------|----------|
| GlobalConfig | `["config"]` | Protocol settings, market counter |
| Market | `["market", market_id_u64_le]` | Boolean market accounts |
| RaceMarket | `["race", market_id_u64_le]` | Race market accounts |
| UserPosition | `["position", market_id_u64_le, user_pubkey]` | Boolean bet positions |
| RacePosition | `["race_position", market_id_u64_le, user_pubkey]` | Race bet positions |
| SolTreasury | `["sol_treasury"]` | Protocol treasury (receives creation fees) |
| CreatorProfile | `["creator_profile", owner_pubkey]` | Creator reputation + fee settings |

**Note:** Both boolean and race markets share a single `market_count` counter in GlobalConfig. The PDA namespace is different (`"market"` vs `"race"`), so they don't collide.

### 6. Trading (placeBet)

The `placeBet` entrypoint constructs a Solana transaction using the program's `place_bet_sol` (boolean) or `bet_on_race_outcome_sol` (race) instructions.

**Account structure for `place_bet_sol` (IDL-verified, 6 accounts):**
1. `config` — GlobalConfig PDA `["config"]` (read-only)
2. `market` — Market account (writable)
3. `position` — UserPosition PDA `["position", market_id, user]` (writable, init_if_needed)
4. `whitelist` — Optional, pass PROGRAM_ID if not needed (read-only)
5. `user` — Signer (writable)
6. `system_program` — System Program

**Account structure for `bet_on_race_outcome_sol` (IDL-verified, 6 accounts):**
1. `config` — GlobalConfig PDA (read-only)
2. `race_market` — RaceMarket account (writable)
3. `position` — RacePosition PDA `["race_position", market_id, user]` (writable, init_if_needed)
4. `whitelist` — Optional, pass PROGRAM_ID if not needed (read-only)
5. `user` — Signer (writable)
6. `system_program` — System Program

### 7. Market Creation (Labs)

Lab market creation requires two steps:

**Step 1: Create a CreatorProfile (one-time)**

Account structure for `create_creator_profile` (3 accounts):
1. `creator_profile` — PDA `["creator_profile", owner]` (writable, init)
2. `owner` — Signer (writable)
3. `system_program`

Args: `display_name` (string), `default_fee_bps` (u16)

**Step 2a: Create a Boolean Lab Market**

Account structure for `create_lab_market_sol` (6 accounts):
1. `config` — GlobalConfig PDA (writable)
2. `market` — Market PDA `["market", config.market_count]` (writable, init)
3. `treasury` — SolTreasury PDA `["sol_treasury"]` (writable)
4. `creator` — Signer (writable)
5. `creator_profile` — Optional CreatorProfile PDA (writable)
6. `system_program`

Args: `question` (string), `closing_time` (i64), `resolution_buffer` (i64), `auto_stop_buffer` (i64), `resolution_mode` (u8), `council` (vec\<pubkey\>), `council_threshold` (u8)

**Step 2b: Create a Race Lab Market**

Account structure for `create_race_market_sol` (6 accounts):
1. `config` — GlobalConfig PDA (writable)
2. `race_market` — RaceMarket PDA `["race", config.market_count]` (writable, init)
3. `creator_profile` — Optional CreatorProfile PDA (read-only)
4. `treasury` — SolTreasury PDA (writable)
5. `creator` — Signer (writable)
6. `system_program`

Args: `question` (string), `outcome_labels` (vec\<string\>), `closing_time` (i64), `resolution_buffer` (i64), `auto_stop_buffer` (i64), `layer` (u8), `resolution_mode` (u8), `access_gate` (u8), `council` (option\<vec\<pubkey\>\>), `council_threshold` (option\<u8\>)

**Important:** Note the different account ordering between boolean and race market creation. The `creator_profile` account appears at position 5 for boolean but position 3 for race markets.

### 8. Instruction Discriminators

All instruction discriminators are hardcoded from the IDL (not computed at runtime):

| Instruction | Discriminator |
|-------------|--------------|
| `place_bet_sol` | `[137, 137, 247, 253, 233, 243, 48, 170]` |
| `bet_on_race_outcome_sol` | `[195, 181, 151, 159, 105, 100, 234, 244]` |
| `create_creator_profile` | `[139, 244, 127, 145, 95, 172, 140, 154]` |
| `create_lab_market_sol` | `[35, 159, 50, 67, 31, 134, 199, 157]` |
| `create_race_market_sol` | `[94, 237, 40, 47, 63, 233, 25, 67]` |

## Customization

### Adding Real-Time Price Feeds

```typescript
// Example: Add Pyth price oracle data to market analysis
import { PythHttpClient } from '@pythnetwork/client';

addEntrypoint({
  key: 'getMarketWithPrice',
  handler: async (ctx) => {
    const market = await baozi.fetchMarket(ctx.input.marketId);
    const pythPrice = await getPythPrice(ctx.input.asset);
    return { output: { ...market, referencePrice: pythPrice } };
  },
});
```

### Connecting to Other Agents (A2A)

This agent can be discovered by other Lucid agents via the A2A protocol. The agent card at `/.well-known/agent-card.json` advertises all entrypoints.

```typescript
// Another agent buying market data from this one:
const markets = await agent.a2a?.client.invoke(
  predictionMarketCard,
  'getMarkets',
  { status: 'active', layer: 'official', limit: 10 }
);
```

### Fee Structure

All fees apply to gross winnings (stake + profit) at claim time:

| Layer | Platform Fee | Creation Fee | Creator Fee (optional) |
|-------|-------------|-------------|----------------------|
| Official | 2.5% | 0.01 SOL | Up to 0.5% |
| Lab | 3% | 0.01 SOL | Up to 0.5% |
| Private | 2% | 0.01 SOL | Up to 0.5% |

**Fee split per claim:**
```
Platform Fee (e.g. 3% for Lab)
├── Affiliate Share (1.0%)  → SolTreasury
├── Creator Share (0.5%)    → SolTreasury
└── Protocol Share (1.5%)   → Staking Vault (if active) or SolTreasury
```

**Solvency Rule:** `creator_fee_bps + affiliate_fee_bps <= platform_fee_bps`

## Entrypoint Reference

| Key | Read/Write | Description |
|-----|-----------|-------------|
| `getMarkets` | Read | List markets with filters (status, layer, query) and odds |
| `getMarketOdds` | Read | Single market probabilities |
| `getPortfolio` | Read | Wallet positions |
| `placeBet` | Write | Execute on-chain bet transaction |
| `analyzeMarket` | Read | Statistical market summary |
| `createCreatorProfile` | Write | Create on-chain creator profile |
| `createLabMarket` | Write | Create boolean Lab market |
| `createLabRaceMarket` | Write | Create multi-outcome Lab race market |

## Parimutuel Rules v6.3 — Market Creation Guardrails

All Lab markets MUST comply with these rules. The agent validates every market creation against these rules **before** submitting the on-chain transaction. Markets that violate mandatory rules are **BLOCKED**.

### Rule A: Event-Based Markets
Markets about specific events (sports, elections, announcements):
- Betting MUST close **at least 12 hours BEFORE** the event
- Recommended buffer: 18-24 hours
- Prevents late-breaking information advantage

### Rule B: Measurement-Period Markets
Markets about measured values (prices, temperatures, metrics):
- Betting MUST close **BEFORE** the measurement period starts
- Prevents betting with foreknowledge of outcomes

### Rule C: Objective Verifiability
Outcomes MUST be objectively verifiable by a third party using public records.

**Blocked terms** (market will be rejected):
- `"ai agent"`, `"an agent"`, `"autonomously"`
- `"will I"`, `"will we"`, `"will my"`, `"will our"` (self-referential)
- `"become popular"`, `"go viral"`, `"be successful"`, `"perform well"`, `"be the best"`, `"breakthrough"`, `"revolutionary"`

### Rule D: Manipulation Prevention
Creators CANNOT make markets about outcomes they can directly influence.

**Blocked terms:**
- `"will someone"`, `"will anyone"`, `"will a person"`, `"will a user"`
- `"purchase proxies"`, `"buy proxies"`, `"x402 payment"`, `"using credits"`

### Rule E: Approved Data Sources (Required)
Markets MUST reference or imply a verifiable data source:

| Category | Approved Sources |
|----------|-----------------|
| Crypto | CoinGecko, CoinMarketCap, Binance, Coinbase, TradingView |
| Sports | ESPN, UFC, UEFA, FIFA, NBA, NFL, MLB, NHL, ATP, WTA |
| Weather | NWS, JMA, Met Office, Weather.gov, AccuWeather |
| Politics | AP News, Reuters, Official Government |
| Finance | SEC, NASDAQ, NYSE, Yahoo Finance, Bloomberg |

Markets can reference sources explicitly `"(Source: CoinGecko)"` or implicitly by mentioning recognized entities (BTC, NBA, Tokyo, etc.).

### Examples

| Question | Status | Why |
|----------|--------|-----|
| "Will BTC be above $120k at 00:00 UTC Mar 1? (Source: CoinGecko)" | Allowed | Clear threshold, approved source, verifiable |
| "Will Real Madrid win Champions League 2026?" | Allowed | Implied ESPN/UEFA source, binary outcome |
| "Will it snow in Tokyo on Feb 14?" | Allowed | Implied JMA source, binary outcome |
| "Will an AI agent autonomously purchase proxies?" | **BLOCKED** | Unverifiable, subjective, manipulation risk |
| "Will crypto go up?" | **BLOCKED** | No threshold, no source |
| "Will I become successful?" | **BLOCKED** | Self-referential, subjective |

## Resolution & Oracle Proofs

Markets are resolved by different authorities depending on their layer:

| Layer | Resolution Authority | How It Works |
|-------|---------------------|--------------|
| Official | Oracle (Grandma Mei) | Automated oracle proposes resolution, 6h dispute window |
| Lab | Host Oracle | Market creator or oracle resolves |
| Private | Creator or Oracle | Creator resolves, or oracle if creator is inactive |

**Lab markets created by this agent use HostOracle resolution mode.** This means the market creator's wallet (the agent's wallet) can resolve the market, or the protocol oracle can resolve it.

### AI Agent Proof Submission

AI agents can submit resolution proofs to Grandma Mei (the protocol oracle). The proof system works as follows:

1. **Agent gathers evidence** — screenshots, API data, official results
2. **Agent posts proof** to the oracle API at `https://baozi.bet/agents/proof`
3. **Grandma Mei reviews** the proof and makes it publicly visible
4. **Oracle resolves** the market on-chain based on the verified proof
5. **6-hour dispute window** — anyone can challenge the resolution

This creates a transparent resolution pipeline where AI agents act as data gatherers and the oracle acts as the trusted resolver. All proofs are publicly visible at [baozi.bet/agents/proof](https://baozi.bet/agents/proof).

## Troubleshooting

- **Empty market list:** Check `SOLANA_RPC_URL` is reachable. Public RPCs rate-limit heavily — use a dedicated provider (Helius, QuickNode, etc.)
- **placeBet fails:** Ensure `SOLANA_PRIVATE_KEY` is set and the wallet has sufficient SOL (bet amount + ~0.01 SOL for fees)
- **"Market is closed":** The market has passed its closing time. Bets are rejected client-side before sending the transaction.
- **createLabMarket fails:** Ensure you've called `createCreatorProfile` first. Each wallet needs a profile before creating markets.
- **"Invalid SOLANA_PRIVATE_KEY":** Must be a base58-encoded 64-byte secret key (not a mnemonic or hex)
- **Stale data:** Market list is cached for 30 seconds. Call `getMarketOdds` for real-time single-market data
