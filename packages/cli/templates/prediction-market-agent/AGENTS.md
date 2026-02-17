# Prediction Market Agent - AI Implementation Guide

This template creates an agent that reads, trades, creates, and manages on-chain Solana prediction markets via the Baozi protocol.

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
| RevenueConfig | `["revenue_config"]` | Protocol revenue routing settings |
| DisputeMeta | `["dispute_meta", market_pubkey]` | Dispute window state for resolution |

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

### 8. Market Cancellation & Refunds

Creators can cancel their own Lab markets, and all bettors receive a **full 100% refund** (no fees deducted).

**Cancel constraints (enforced on-chain):**
- Creator can cancel if `has_bets == false` (no bets yet) OR pool < 0.5 SOL
- Admin/guardian can cancel any market at any time (emergency)
- Cannot cancel resolved or already-cancelled markets
- Creator does NOT get the 0.01 SOL creation fee back (paid to treasury)

**Refund flow:**
1. Creator calls `cancelLabMarket` with a reason
2. Market status changes to `cancelled`
3. Each bettor calls `claimRefund` to withdraw their full bet amount
4. Race market refunds return ALL bets across all outcomes (total_bet)

**Account structure for `cancel_market` (IDL-verified, 3 accounts):**
1. `config` — GlobalConfig PDA (read-only)
2. `market` — Market account (writable)
3. `authority` — Signer (creator or admin)

Args: `reason` (string)

**Account structure for `cancel_race` (IDL-verified, 3 accounts):**
1. `config` — GlobalConfig PDA (read-only)
2. `race_market` — RaceMarket account (writable)
3. `authority` — Signer (creator or admin)

Args: `reason` (string)

**Account structure for `claim_refund_sol` (IDL-verified, 4 accounts):**
1. `market` — Market account (writable)
2. `position` — UserPosition PDA (writable)
3. `user` — Signer (writable)
4. `system_program`

**Account structure for `claim_race_refund` (IDL-verified, 4 accounts):**
1. `race_market` — RaceMarket account (writable)
2. `position` — RacePosition PDA (writable)
3. `user` — Signer (writable)
4. `system_program`

### 9. Claiming Winnings

After a market is resolved, winners claim their payout from the pool.

**Payout formula:** `(your_bet / winning_pool) * total_pool - platform_fee`

**Account structure for `claim_winnings_sol` (IDL-verified, 10 accounts — 4 optional):**
1. `config` — GlobalConfig PDA (read-only)
2. `market` — Market account (writable)
3. `position` — UserPosition PDA (writable)
4. `sol_treasury` — SolTreasury PDA (writable)
5. `affiliate` — Optional affiliate account, pass PROGRAM_ID if None (writable)
6. `creator_profile` — Optional CreatorProfile, pass PROGRAM_ID if None (writable)
7. `revenue_config` — Optional RevenueConfig PDA, pass PROGRAM_ID if None (writable)
8. `staking_vault` — Optional staking vault, pass PROGRAM_ID if None (writable)
9. `user` — Signer (writable)
10. `system_program`

**Account structure for `claim_race_winnings_sol` (IDL-verified, 11 accounts — 5 optional):**
1. `config` — GlobalConfig PDA (read-only)
2. `race_market` — RaceMarket account (writable)
3. `position` — RacePosition PDA (writable)
4. `sol_treasury` — SolTreasury PDA (writable)
5. `affiliate` — Optional affiliate account, pass PROGRAM_ID if None (writable)
6. `race_referral` — Optional race referral PDA, pass PROGRAM_ID if None (read-only)
7. `creator_profile` — Optional CreatorProfile, pass PROGRAM_ID if None (writable)
8. `revenue_config` — Optional RevenueConfig PDA, pass PROGRAM_ID if None (writable)
9. `staking_vault` — Optional staking vault, pass PROGRAM_ID if None (writable)
10. `user` — Signer (writable)
11. `system_program`

**Note:** Optional accounts use the Anchor convention — pass `PROGRAM_ID` as a placeholder when the account is not needed. This is how the agent template handles it.

### 10. Finalizing Resolution

After the oracle proposes a resolution, there's a 6-hour dispute window. Once the window closes, anyone can finalize the resolution (permissionless). This moves the market from `resolved_pending` to `resolved`, enabling claims.

**Account structure for `finalize_resolution` (IDL-verified, 3 accounts):**
1. `market` — Market account (writable)
2. `dispute_meta` — DisputeMeta PDA `["dispute_meta", market_pubkey]` (writable)
3. `finalizer` — Signer (any wallet)

**Account structure for `finalize_race_resolution` (IDL-verified, 3 accounts):**
1. `race_market` — RaceMarket account (writable)
2. `dispute_meta` — DisputeMeta PDA `["dispute_meta", race_market_pubkey]` (writable)
3. `finalizer` — Signer (any wallet)

### 11. Instruction Discriminators

All instruction discriminators are hardcoded from the IDL (not computed at runtime):

| Instruction | Discriminator |
|-------------|--------------|
| `place_bet_sol` | `[137, 137, 247, 253, 233, 243, 48, 170]` |
| `bet_on_race_outcome_sol` | `[195, 181, 151, 159, 105, 100, 234, 244]` |
| `create_creator_profile` | `[139, 244, 127, 145, 95, 172, 140, 154]` |
| `create_lab_market_sol` | `[35, 159, 50, 67, 31, 134, 199, 157]` |
| `create_race_market_sol` | `[94, 237, 40, 47, 63, 233, 25, 67]` |
| `cancel_market` | `[205, 121, 84, 210, 222, 71, 150, 11]` |
| `cancel_race` | `[223, 214, 232, 232, 43, 15, 165, 234]` |
| `claim_refund_sol` | `[8, 82, 5, 144, 194, 114, 255, 20]` |
| `claim_race_refund` | `[174, 101, 101, 227, 171, 69, 173, 243]` |
| `claim_winnings_sol` | `[64, 158, 207, 116, 128, 129, 169, 76]` |
| `claim_race_winnings_sol` | `[46, 120, 202, 194, 126, 72, 22, 52]` |
| `finalize_resolution` | `[191, 74, 94, 214, 45, 150, 152, 125]` |
| `finalize_race_resolution` | `[19, 232, 81, 138, 191, 218, 54, 200]` |

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
| `cancelLabMarket` | Write | Cancel a Lab market (full refund to bettors) |
| `claimRefund` | Write | Claim refund from cancelled market |
| `claimWinnings` | Write | Claim SOL winnings from resolved market |
| `finalizeResolution` | Write | Finalize resolution after 6h dispute window (permissionless) |

## Parimutuel Rules v6.3 — Market Creation Guardrails

All Lab markets MUST comply with these rules. The agent validates every market creation against these rules **before** submitting the on-chain transaction. Markets that violate mandatory rules are **BLOCKED**.

### THE GOLDEN RULE

> Bettors must NEVER have access to ANY information that could inform the outcome while betting is still open.

### Type A: Event-Based Markets

Markets about specific events — the outcome is decided at a single moment in time.

**Examples:** CS2 Major finals, LoL Worlds match, UFC title fight, Super Bowl winner, crypto price at specific timestamp, election result, award ceremony winner.

**Timing rules:**
- Betting MUST close **at least 8 hours BEFORE** the event
- Recommended buffer: 12-24 hours
- Prevents late-breaking information advantage (lineup leaks, injury news, insider info)

**Best categories:**
| Category | Why It Works | Example |
|----------|-------------|---------|
| Esports (CS2, LoL, Valorant) | Clear start times, binary outcomes, huge community | "Will NaVi win CS2 Major Copenhagen?" |
| Combat Sports (UFC, Boxing) | Single-event outcomes, high engagement | "Will Topuria defend UFC FW title at UFC 315?" |
| Sports Finals | High stakes, massive audience | "Will Real Madrid win Champions League 2026?" |
| Crypto Snapshots | Precise timestamps, on-chain verifiable | "Will BTC be above $150k at 00:00 UTC Mar 1? (Source: CoinGecko)" |
| Elections/Awards | Single announcement moment | "Will Film X win Best Picture at Oscars 2026?" |

### Type B: Measurement-Period Markets

Markets about accumulated data over a defined time window.

**Examples:** Netflix Top 10 for a week, Billboard chart position, total DeFi TVL over a period, weekly weather records.

**Timing rules:**
- Betting MUST close **BEFORE** the measurement period starts
- Measurement period: max 14 days (users hate locking up capital)
- Ideal period: 2-7 days (short lockup = more volume)

**Best categories:**
| Category | Why It Works | Example |
|----------|-------------|---------|
| Streaming Charts | Weekly data, public rankings | "Will Show X be Netflix #1 for week of Mar 3?" |
| Music Charts | Billboard/Spotify, clear measurement windows | "Will Artist Y debut top 5 on Billboard Hot 100?" |
| DeFi Metrics | On-chain data, precise measurement | "Will Solana DeFi TVL exceed $15B by end of week?" |
| Weather Records | NWS/JMA data, defined periods | "Hottest day in Tokyo this week above 15C?" |

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
| Esports | HLTV (CS2), Liquipedia, Riot Games (LoL), FACEIT, ESL |
| Sports | ESPN, UFC, UEFA, FIFA, NBA, NFL, MLB, NHL, ATP, WTA |
| Weather | NWS, JMA, Met Office, Weather.gov, AccuWeather |
| Politics | AP News, Reuters, Official Government |
| Finance | SEC, NASDAQ, NYSE, Yahoo Finance, Bloomberg |
| Streaming | Netflix Top 10, Spotify Charts, Billboard |

Markets can reference sources explicitly `"(Source: CoinGecko)"` or implicitly by mentioning recognized entities (BTC, NBA, CS2, NaVi, Netflix, etc.).

### Examples

| Question | Type | Status | Why |
|----------|------|--------|-----|
| "Will NaVi beat FaZe in CS2 Major Grand Final? (Kickoff: Mar 15 14:00 UTC)" | A | Allowed | Clear event, HLTV source, binary outcome |
| "Who wins IEM Katowice 2026? [NaVi/FaZe/G2/Vitality]" | A (Race) | Allowed | Clear event, multi-outcome race market |
| "Will T1 win LoL Worlds 2026?" | A | Allowed | Implied Riot Games/Liquipedia source |
| "Will BTC be above $150k at 00:00 UTC Mar 1? (Source: CoinGecko)" | A | Allowed | Clear snapshot time, approved source |
| "Will Netflix 'Squid Game S3' be #1 for week of Feb 24?" | B | Allowed | 7-day measurement, Netflix Top 10 source |
| "Hottest day in Tokyo this week above 15C? (Feb 17-23)" | B | Allowed | 7-day measurement, JMA source |
| "Will SOL DeFi TVL pass $20B this week?" | B | Allowed | Short period, on-chain verifiable |
| "Will an AI agent autonomously purchase proxies?" | — | **BLOCKED** | Unverifiable, subjective, manipulation risk |
| "Will crypto go up?" | — | **BLOCKED** | No threshold, no timeframe, no source |
| "Will I become successful?" | — | **BLOCKED** | Self-referential, subjective |
| "Will BTC hit $200k by 2027?" | — | **BLOCKED** | >14 day lockup, no snapshot time |

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

## Beyond Prediction Markets — The Outcome Protocol

Baozi isn't just prediction markets — it's an on-chain outcome protocol: pools + proofs + private rooms. The building blocks (boolean markets, race markets, private tables, oracle proofs, creator profiles) combine into patterns that go way beyond "will X happen":

### Agent Rooms (Private Tables)
Whitelisted bots + humans making markets for their niche. An AI research collective could run a private table where only verified agents can bet on research outcomes — "Which LLM scores highest on SWE-bench this month?"

### Task Markets
Post a job, fund the pot, someone bonds in, delivers receipts, oracle verifies, payout triggers. A race market becomes a competitive bounty: "Which agent delivers the cleanest dataset for Solana DEX trades this week?"

### Signal Games
Communities run weekly "who called it right?" ladders. A Discord bot creates Lab markets every Monday — top callers climb the leaderboard. Reputation backed by real SOL, not just internet points.

### Ops & SLA Markets
Internal team accountability: "Will we ship v5 by Friday?" "Uptime stays >99.9% this week?" Proof from deployment logs or monitoring dashboards. Short 7-day measurement periods, real skin in the game.

### Oracle-as-a-Service
Submit a market with a question → Grandma Mei brings proof from approved sources → settles on-chain. Any agent can tap into this — you don't need your own oracle infrastructure.

### Field Verification
"Is this restaurant actually open?" "What's the shelf price of X at location Y?" Private + bonded markets where someone stakes SOL that they'll provide verified photo proof. Works with any local verification task.

## Future Entrypoints (Not Yet Implemented)

These IDL instructions exist on-chain and could be added to the agent:

| Instruction | What It Does | Priority |
|-------------|-------------|----------|
| `flag_dispute` | Challenge a proposed resolution during 6h window | MEDIUM |
| `register_affiliate` | Register as affiliate for 1% referral commission | LOW |
| `close_market` / `close_race_market` | Close expired market (permissionless cleanup) | LOW |
| `vote_council` / `vote_council_race` | Council member votes on disputed outcome | LOW |

**Note:** `extend_market` / `extend_race_market` are **admin-only** instructions (IDL signer is `admin`). Lab market creators cannot extend their own markets — this is by design to prevent manipulation.

## Troubleshooting

- **Empty market list:** Check `SOLANA_RPC_URL` is reachable. Public RPCs rate-limit heavily — use a dedicated provider (Helius, QuickNode, etc.)
- **placeBet fails:** Ensure `SOLANA_PRIVATE_KEY` is set and the wallet has sufficient SOL (bet amount + ~0.01 SOL for fees)
- **"Market is closed":** The market has passed its closing time. Bets are rejected client-side before sending the transaction.
- **createLabMarket fails:** Ensure you've called `createCreatorProfile` first. Each wallet needs a profile before creating markets.
- **cancelLabMarket fails:** Creator can only cancel if no bets placed yet, or pool < 0.5 SOL. Admin can cancel anytime.
- **claimRefund fails:** Market must be in `cancelled` status. Check market status first with `getMarketOdds`.
- **"Invalid SOLANA_PRIVATE_KEY":** Must be a base58-encoded 64-byte secret key (not a mnemonic or hex)
- **Stale data:** Market list is cached for 30 seconds. Call `getMarketOdds` for real-time single-market data
