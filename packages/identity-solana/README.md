# @lucid-agents/identity-solana

Solana identity plugin for Lucid Agents SDK, designed to mirror the EVM identity package API while keeping Solana dependencies isolated.

## Install

```bash
bun add @lucid-agents/identity-solana
bun add @solana/web3.js 8004-solana
```

## Usage

```ts
import { createAgent } from "@lucid-agents/core";
import { identitySolana, identitySolanaFromEnv } from "@lucid-agents/identity-solana";

const agent = await createAgent({
  name: "solana-agent"
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
- `createSolanaRegistryClients()`
- `createAgentCardWithSolanaIdentity()`
- `mapSolanaTrustToTrustConfig()`
- `SolanaRegistryClients` (type)

## Environment Variables

- `SOLANA_PRIVATE_KEY` JSON array (e.g. `[12,34,...]`)
- `SOLANA_CLUSTER` default: `mainnet-beta`
- `SOLANA_RPC_URL` optional custom RPC URL
- `AGENT_DOMAIN` domain used for registration
- `REGISTER_IDENTITY` `true|false`
- `PINATA_JWT` optional metadata pinning JWT
- `ATOM_ENABLED` `true|false`

## Browser wallets and `skipSend`

If a wallet adapter is provided and no `SOLANA_PRIVATE_KEY` is configured, `skipSend` is automatically enabled. This allows browser-wallet-first flows where transactions are prepared/signed externally.

You can still override explicitly per call:

```ts
await agent.sendSolanaFeedback({
  to: "ReceiverPubkey1111111111111111111111111111111",
  score: 1,
  comment: "x402 settled",
  skipSend: false
});
```

## Programmatic registration

```ts
import {
  createSolanaAgentIdentity,
  identitySolanaFromEnv
} from "@lucid-agents/identity-solana";

const identity = await createSolanaAgentIdentity({
  config: identitySolanaFromEnv(),
  agentCard: {
    domain: "agent.example",
    metadataUri: "ipfs://..."
  }
});
```

## Tests

```bash
bun test packages/identity-solana
```