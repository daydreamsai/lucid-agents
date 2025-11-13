## {{AGENT_NAME}}

This project was scaffolded with `create-agent-kit` and includes **ERC-8004 identity registration** built on [`@lucid-agents/core`](https://www.npmjs.com/package/@lucid-agents/core) and [`@lucid-agents/identity`](https://www.npmjs.com/package/@lucid-agents/identity).

### Features

- ✅ ERC-8004 on-chain identity registration
- ✅ Automatic trust metadata in agent manifest
- ✅ x402 payment support
- ✅ Access to all three registries (Identity, Reputation, Validation)
- ✅ Domain ownership proof signing

### Quick start

1. **Set up your environment:**

   ```sh
   cp .env.example .env
   # Edit .env and add your PRIVATE_KEY
   ```

   The private key is used to:

   - Register your agent on-chain (ERC-8004 Identity Registry)
   - Sign domain ownership proofs

   By default, the agent is configured for **Base Sepolia testnet**. If you want to use a different network, update `CHAIN_ID` and `RPC_URL` in your `.env` file.

2. **Install dependencies:**

   ```sh
   bun install
   ```

3. **Run the agent:**
   ```sh
   bun run dev
   ```

The agent will:

- Check if it's registered on the ERC-8004 Identity Registry
- Auto-register if not found (when `AUTO_REGISTER=true`)
- Sign a domain ownership proof
- Include trust metadata in `/.well-known/agent.json`

### Project structure

- `src/agent.ts` – Agent definition with identity bootstrap and entrypoints
- `src/index.ts` – HTTP server that serves the agent

### Default entrypoints

- `echo` – Echo input text

### ERC-8004 Registries

Your agent has access to all three registries:

```typescript
import { identityClient, reputationClient, validationClient } from "./agent";

// Give feedback to another agent
await reputationClient.giveFeedback({
  toAgentId: 42n,
  score: 90,
  tag: "helpful",
  comment: "Great service!",
});

// Create a validation request
await validationClient.createRequest({
  requestType: "inference-validation",
  dataHash: "0x...",
});
```

### Environment Variables

**Required:**

- `PRIVATE_KEY` – Your wallet's private key for signing transactions and payments

**Pre-configured from setup:**

- `AGENT_DOMAIN` – Configured during agent creation
- `FACILITATOR_URL`, `PAYMENTS_RECEIVABLE_ADDRESS`, `NETWORK`, `DEFAULT_PRICE` – Payment settings from setup

**Optional:**

- `RPC_URL` – Blockchain RPC endpoint (default: Base Sepolia)
- `CHAIN_ID` – Chain ID (default: 84532 for Base Sepolia)

**Optional (server):**

- `PORT` – HTTP server port (default: 3000)

> **Note:** ERC-8004 registry addresses are automatically configured using CREATE2 deterministic addresses. You don't need to specify them.

### Available scripts

- `bun run dev` – Start with hot reload
- `bun run start` – Start once
- `bun run agent` – Run agent module directly
- `bunx tsc --noEmit` – Type-check

### Next steps

1. **Deploy your agent** - Both well-known files are auto-served:

   - `/.well-known/agent-card.json` - Full agent manifest
   - `/.well-known/agent-metadata.json` - ERC-8004 identity metadata (only if registered)

2. **Customize your agent** in `src/agent.ts`

3. **Add more entrypoints** with different capabilities

4. **Deploy** to your favorite platform

### Learn more

- [Agent Kit Documentation](https://github.com/lucid-dreams/lucid-agents/blob/master/packages/core/README.md)
- [Identity Kit Documentation](https://github.com/lucid-dreams/lucid-agents/blob/master/packages/identity/README.md)
- [ERC-8004 Specification](https://eips.ethereum.org/EIPS/eip-8004)
