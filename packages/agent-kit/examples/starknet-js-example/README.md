## starknet-js-example

Example Bun agent that uses [`starknet.js`](https://www.starknetjs.com/) together with [`@lucid-agents/agent-kit`](https://www.npmjs.com/package/@lucid-agents/agent-kit). It exposes entrypoints that read ETH balances or iterate through a configurable Starknet token list, making it easy to plug on-chain Starknet data into any Agent Kit workflow.

### Requirements

- Bun 1.1+
- Access to a Starknet RPC endpoint (tested on Sepolia)
- (Optional) x402 payments configuration if you want to monetize the entrypoints

### Setup

1. Install dependencies:
   ```sh
   bun install
   ```
2. Copy the example env file and fill in your values:
   ```sh
   cp .env.example .env
   ```
   Required values:
   - `STARKNET_RPC_URL` – e.g. `https://starknet-sepolia.infura.io/v3/<key>`

   Optional but useful:
   - `STARKNET_ACCOUNT_ADDRESS` – default address when the request omits one
   - `STARKNET_PRIVATE_KEY` – enables account actions via `starknet.js`
   - `STARKNET_ETH_CONTRACT` – override the ETH ERC‑20 contract (defaults to Sepolia ETH)
   - `PAYMENTS_*` variables – enable x402 monetization when `PAYMENTS_DEFAULT_PRICE` is set
3. Run in watch mode:
   ```sh
   bun run dev
   ```

The dev command hot-reloads when files inside `src/` change. Use `bun run start` for a single run or `bun run agent` to execute the agent module directly.

### Entrypoints

#### `starknet-balance`
Reads the ETH balance for a Starknet address using `starknet.js`. When the request omits `address`, the agent falls back to `STARKNET_ACCOUNT_ADDRESS`. The response includes the resolved address, raw wei balance, formatted ETH balance (18 decimals), and a localized summary string.

```bash
curl -X POST http://localhost:8787/entrypoints/starknet-balance/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "address": "0x0123..." // optional
    }
  }'
```

#### `starknet-token-balances`
Iterates through the curated list in `src/token_list.json`, fetching ERC‑20 balances for each token. Pass `include_zero_balances: false` to omit empty holdings. The result groups successful balances (with token metadata, raw wei amount, and formatted units) and a parallel list of per-token errors so you can surface partial failures.

```bash
curl -X POST http://localhost:8787/entrypoints/starknet-token-balances/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "address": "0x0123...",
      "include_zero_balances": false
    }
  }'
```

Customize the portfolio by editing `src/token_list.json` (schema enforced via `tokenRegistry.ts`). Any token with an ABI-compatible `balanceOf` entrypoint can be added.

#### `echo`
Utility entrypoint that simply echoes the provided text—handy for quick connectivity tests.

### Project structure

- `src/agent.ts` – defines agent metadata and entrypoints (echo, Starknet balance readers).
- `src/starknet.ts` – shared helpers for RPC provider creation plus ETH/token balance fetching.
- `src/tokenRegistry.ts` & `src/token_list.json` – declarative token list with runtime validation.
- `src/config.ts` – centralizes Starknet env parsing with memoized accessors.
- `src/index.ts` – boots the Bun HTTP server.

### Payments & monetization (optional)

Supply the x402 env variables (`PAYMENTS_RECEIVABLE_ADDRESS`, `PAYMENTS_NETWORK`, `PAYMENTS_DEFAULT_PRICE`, `PAYMENTS_FACILITATOR_URL`) to charge for requests. When `PAYMENTS_DEFAULT_PRICE` is set, the agent auto-loads the config and enforces pricing for every entrypoint.

### Next steps

- Extend `src/agent.ts` with additional Starknet actions (e.g., calldata simulation, messaging entrypoints).
- Point `STARKNET_RPC_URL` to mainnet once you are ready for production traffic.
- Deploy the Bun server to your preferred platform and register an ERC‑8004 identity if desired.
