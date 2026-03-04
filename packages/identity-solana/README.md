# @lucid-agents/identity-solana

Solana identity plugin for Lucid SDK, aligned with the `@lucid-agents/identity` (EVM) style API.

## Install

Add this package and keep Solana SDK dependencies as peers in your app:

- `@lucid-agents/identity-solana`
- `@solana/web3.js`
- `8004-solana`

## Usage

```ts
import { createAgent } from "@lucid-agents/core";
import { identitySolana, identitySolanaFromEnv } from "@lucid-agents/identity-solana";

const agent = await createAgent({
  name: "solana-agent",
  description: "Agent with Solana registry identity"
})
  .use(
    identitySolana({
      config: identitySolanaFromEnv()
    })
  )
  .build();
```

## Exports

- `identitySolana()`
- `identitySolanaFromEnv()`
- `createSolanaAgentIdentity()`
- `SolanaRegistryClients` (identity + reputation registry clients)
- `createAgentCardWithSolanaIdentity()`

## Environment variables

- `SOLANA_PRIVATE_KEY`: JSON array secret key bytes (optional for browser wallet mode)
- `SOLANA_CLUSTER`: Solana cluster (`mainnet-beta` default)
- `SOLANA_RPC_URL`: custom RPC URL override
- `AGENT_DOMAIN`: domain for identity registration
- `REGISTER_IDENTITY`: boolean, register on manifest build
- `PINATA_JWT`: optional pinning token forwarded to SDK
- `ATOM_ENABLED`: boolean forwarded to SDK

## Browser wallet mode

When using a browser wallet adapter and no `SOLANA_PRIVATE_KEY`, `skipSend` is auto-enabled unless explicitly set.

## Local testing

```bash
bun test
```

This package includes unit, integration (SDK-mocked), and plugin contract tests.