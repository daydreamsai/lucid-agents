# @lucid-agents/identity-solana

8004-Solana identity helpers for the Lucid agent SDK. Mirrors `@lucid-agents/identity` (EVM/ERC-8004) for Solana — same Extension API, different chain.

## Installation

```bash
bun add @lucid-agents/identity-solana @solana/web3.js 8004-solana
```

## Quick Start

```ts
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import {
  identitySolana,
  identitySolanaFromEnv,
} from '@lucid-agents/identity-solana';

const agent = await createAgent({ name: 'my-agent', version: '1.0.0' })
  .use(http())
  .use(identitySolana({ config: identitySolanaFromEnv() }))
  .build();
```

## Environment Variables

| Variable             | Description                                                                     | Required             |
| -------------------- | ------------------------------------------------------------------------------- | -------------------- |
| `SOLANA_PRIVATE_KEY` | JSON array of numbers (Uint8Array) — e.g. `[1,2,3,...]`                         | For registration     |
| `SOLANA_CLUSTER`     | `mainnet-beta` \| `devnet` \| `testnet` \| `localnet` (default: `mainnet-beta`) | No                   |
| `SOLANA_RPC_URL`     | Custom RPC endpoint                                                             | No                   |
| `AGENT_DOMAIN`       | Agent domain for identity registration                                          | Recommended          |
| `REGISTER_IDENTITY`  | `true`/`false` — auto-register on startup                                       | No (default: `true`) |
| `PINATA_JWT`         | Pinata JWT for IPFS metadata upload                                             | No                   |
| `ATOM_ENABLED`       | Enable ATOM protocol support                                                    | No                   |

## Manual Configuration

```ts
import { createAgent } from '@lucid-agents/core';
import { identitySolana } from '@lucid-agents/identity-solana';

const agent = await createAgent({ name: 'my-agent', version: '1.0.0' })
  .use(
    identitySolana({
      config: {
        privateKey: new Uint8Array([
          /* your 64-byte keypair */
        ]),
        cluster: 'devnet',
        domain: 'my-agent.example.com',
        autoRegister: true,
        trustModels: ['feedback', 'inference-validation'],
      },
    })
  )
  .build();
```

## Browser Wallet Support (skipSend)

For browser wallets where signing must be deferred:

```ts
import { createSolanaAgentIdentity } from '@lucid-agents/identity-solana';

const identity = await createSolanaAgentIdentity({
  domain: 'my-agent.example.com',
  registration: { skipSend: true },
});

if (identity.unsignedTransaction) {
  // Sign and broadcast with user's browser wallet
  const signedTx = await wallet.signTransaction(identity.unsignedTransaction);
  await connection.sendRawTransaction(signedTx.serialize());
}
```

## Registry Clients

After identity is created, use the registry clients:

```ts
const identity = await createSolanaAgentIdentity({ autoRegister: true });

if (identity.clients) {
  // Give feedback to another agent
  await identity.clients.reputation.giveFeedback({
    toAgentId: BigInt(42),
    value: 90,
    tag1: 'reliable',
    tag2: 'fast',
    endpoint: 'https://other-agent.example.com',
  });

  // Get agent record
  const record =
    await identity.clients.identity.getAgentByOwner('wallet-address');
}
```

## API Reference

### `identitySolana(options?)`

Extension for Lucid SDK. Accepts `config?: SolanaIdentityConfig`.

### `identitySolanaFromEnv(env?)`

Creates `SolanaIdentityConfig` from environment variables.

### `createSolanaAgentIdentity(options)`

Core function — registers agent on 8004-Solana, returns `SolanaAgentIdentity` with `trust`, `record`, and `clients`.

### `createAgentCardWithSolanaIdentity(card, trustConfig)`

Merges Solana trust into an A2A Agent Card (immutable).

### `SolanaRegistryClients`

```ts
type SolanaRegistryClients = {
  identity: SolanaIdentityRegistryClient;
  reputation: SolanaReputationRegistryClient;
};
```

## Differences from @lucid-agents/identity (EVM)

| Feature        | EVM                       | Solana                 |
| -------------- | ------------------------- | ---------------------- |
| Registry       | ERC-8004 on Ethereum/Base | 8004-Solana program    |
| Key format     | `0x…` hex private key     | JSON array `[1,2,3,…]` |
| Chain config   | `chainId` + `rpcUrl`      | `cluster` + `rpcUrl`   |
| Peer deps      | `viem`                    | `@solana/web3.js`      |
| Extension name | `identity`                | `identity-solana`      |
