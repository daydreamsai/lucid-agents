# Prediction Market Agent - AI Implementation Guide

This template creates an agent that reads and trades on-chain Solana prediction markets via the Baozi protocol.

## Architecture

**Data Source:** Solana blockchain (program `FWyTPzm5cfJwRKzfkscxozatSxF6Qu78JQovQUwKPruJ`)
**Parsing:** Direct Borsh deserialization from on-chain account data
**Pricing:** Pari-mutuel (pool-based implied probabilities)
**Caching:** 30-second TTL for market list queries
**Dependencies:** `@solana/web3.js`, `bs58` only

## Key Concepts

### 1. On-Chain Data Reading

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

Account data is parsed using a cursor-based `BorshReader` that walks through the binary layout field by field.

### 2. Pari-Mutuel Pricing

Unlike order-book markets, pari-mutuel markets determine payouts from pool ratios:

- **Boolean market:** P(Yes) = noPool / totalPool, P(No) = yesPool / totalPool
- **Race market:** Probabilities normalized across all outcome pools
- **Payout if correct:** totalPool / winningOutcomePool (minus fees)

### 3. Market Types

| Type | Outcomes | ID Prefix | Pool Structure |
|------|----------|-----------|----------------|
| Boolean | 2 (Yes/No) | `market` | yesPool + noPool |
| Race | 2–10 | `race` | outcomePools[10] array |

### 4. Market Layers

| Layer | Value | Description |
|-------|-------|-------------|
| Official | 0 | Admin-created, highest trust |
| Lab | 1 | Community-created |
| Private | 2 | Invite-only |

### 5. Trading (placeBet)

The `placeBet` entrypoint constructs a Solana transaction using the program's `place_bet_sol` (boolean) or `bet_on_race_outcome_sol` (race) instructions. Required accounts are derived as PDAs from deterministic seeds.

**Account structure for place_bet_sol:**
1. `config` — GlobalConfig PDA (`["config"]`)
2. `market` — Market account (writable)
3. `position` — UserPosition PDA (`["position", market_id, user]`, writable, init_if_needed)
4. `whitelist` — Optional whitelist PDA (program ID if not needed)
5. `pointsConfig` — PointsConfig PDA (`["points_config"]`)
6. `userPoints` — UserPoints PDA (`["user_points", user]`, writable, init_if_needed)
7. `user` — Signer (writable)
8. `systemProgram` — System Program

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
  { status: 'active', limit: 10 }
);
```

### Fee Structure

All fees apply to gross winnings (stake + profit) at claim time:

| Layer | Platform Fee |
|-------|-------------|
| Official | 2.5% |
| Lab | 3% |
| Private | 2% |

## Entrypoint Reference

| Key | Read/Write | Description |
|-----|-----------|-------------|
| `getMarkets` | Read | List markets with filters and odds |
| `getMarketOdds` | Read | Single market probabilities |
| `getPortfolio` | Read | Wallet positions and P&L |
| `placeBet` | Write | Execute on-chain bet transaction |
| `analyzeMarket` | Read | Statistical market summary |

## Troubleshooting

- **Empty market list:** Check `SOLANA_RPC_URL` is reachable. Public RPCs rate-limit heavily — use a dedicated provider (Helius, QuickNode, etc.)
- **placeBet fails:** Ensure `SOLANA_PRIVATE_KEY` is set and the wallet has sufficient SOL (bet amount + ~0.01 SOL for fees)
- **Stale data:** Market list is cached for 30 seconds. Call `getMarketOdds` for real-time single-market data
