# @lucid-agents/identity-solana

Solana identity integration for Lucid agents, mirroring the EVM `@lucid-agents/identity` flow.

## Install

This package expects Solana deps as **peer dependencies** (kept out of EVM package bundles):

- `8004-solana`
- `@solana/web3.js`

## Quick usage

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
- `mergeTrustConfigs()`
- `validateIdentitySolanaConfig()`
- `getSolanaPublicKey()`
- `resolveSolanaRpcUrl()`
- `SolanaRegistryClients` type

## Environment

Supported env vars:

- `SOLANA_PRIVATE_KEY` (JSON array, 32 or 64 bytes)
- `SOLANA_CLUSTER` (`mainnet-beta` default)
- `SOLANA_RPC_URL`
- `AGENT_DOMAIN`
- `REGISTER_IDENTITY` (boolean)
- `PINATA_JWT`
- `ATOM_ENABLED` (boolean)
- `SOLANA_SKIP_SEND` (optional boolean)

## Browser wallet + skipSend

If you provide a browser wallet adapter and no private key, `skipSend` defaults to `true` so calls can return unsigned/prepared tx payloads for wallet UX flows.

You can override per call:

```ts
await agent.identity.solana.register({}, { skipSend: false });
```

## Trust mapping

Solana SDK trust tier/assets are converted into Lucid `TrustConfig` to keep the rest of the Lucid stack unchanged.

Mapped fields include:

- `provider: "solana"`
- `chain: "solana"`
- `tier`
- `assets[]`
- `requirements[]`

## Example

See:

- `packages/examples/src/solana-identity.ts`

It demonstrates:

- devnet setup
- identity registration
- paid endpoint handling
- x402 feedback submission