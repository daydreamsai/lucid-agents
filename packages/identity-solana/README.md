# @lucid-agents/identity-solana

Solana identity extension for the Lucid Agents SDK.

## Installation

```bash
npm install @lucid-agents/identity-solana
```

## Usage

```typescript
import { createAgent } from '@lucid-agents/core';
import { identitySolana, identitySolanaFromEnv } from '@lucid-agents/identity-solana';

const agent = createAgent({
  name: 'SolanaAgent'
})
.use(identitySolana({ config: identitySolanaFromEnv() }))
.build();

console.log('Solana Public Key:', agent.identity.getPublicKey());
```

## Configuration

Environment variables:
- `SOLANA_PRIVATE_KEY`: JSON array of numbers.
- `SOLANA_CLUSTER`: `mainnet-beta` or `devnet`.
- `SOLANA_RPC_URL`: Custom RPC endpoint.
