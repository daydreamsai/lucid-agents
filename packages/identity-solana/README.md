# @lucid-agents/identity-solana

Solana payment and utility extension for Lucid SDK. Provides Solana-specific payment helpers and optional Solana identity adapter (non-EVM). Note: On-chain identity registration in Lucid uses ERC-8004 on EVM networks; this package does not replace ERC-8004 identity.

## Installation

```bash
npm install @lucid-agents/identity-solana
# or
bun add @lucid-agents/identity-solana
```

## Quick Start

```typescript
import { createAgent } from '@lucid-agents/core';
import { identitySolana, identitySolanaFromEnv } from '@lucid-agents/identity-solana';

const agent = await createAgent({
  name: 'my-solana-agent',
  version: '1.0.0',
}).use(identitySolana({
  config: identitySolanaFromEnv()
})).build();
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SOLANA_PRIVATE_KEY` | Private key for signing transactions (hex) | - |
| `SOLANA_CLUSTER` | Solana cluster | `mainnet-beta` |
| `SOLANA_RPC_URL` | RPC endpoint URL | - |
| `AGENT_DOMAIN` | Agent domain for identity | - |
| `REGISTER_IDENTITY` | Auto-register if not found | `false` |
| `PINATA_JWT` | Pinata JWT for IPFS uploads | - |
| `ATOM_ENABLED` | Enable ATOM protocol support | `false` |

### Programmatic Configuration

```typescript
import { identitySolana } from '@lucid-agents/identity-solana';

const agent = await createAgent({...})
  .use(identitySolana({
    config: {
      rpcUrl: 'https://api.devnet.solana.com',
      cluster: 'devnet',
      autoRegister: true,
      registration: {
        name: 'My Solana Agent',
        description: 'An agent running on Solana',
        url: 'https://my-agent.com',
        domain: 'my-agent.sol',
        x402Support: true,
        skipSend: false,
      }
    }
  }))
  .build();
```

## API

### identitySolana()

Creates a Solana identity extension for Lucid agents.

```typescript
identitySolana(options?: { config?: SolanaIdentityConfig })
```

### identitySolanaFromEnv()

Creates configuration from environment variables.

```typescript
const config = identitySolanaFromEnv();
```

### createSolanaAgentIdentity()

Creates a Solana agent identity.

```typescript
const identity = await createSolanaAgentIdentity({
  runtime,
  domain: 'my-agent.sol',
  autoRegister: true,
  rpcUrl: 'https://api.devnet.solana.com',
  cluster: 'devnet',
  registration: {
    name: 'My Agent',
    description: 'Description',
  }
});
```

### Trust Tiers

The extension supports trust tiers:

- `TrustTier.NONE (0)` - No trust
- `TrustTier.BASIC (1)` - Basic trust
- `TrustTier.VERIFIED (2)` - Verified identity
- `TrustTier.PREMIUM (3)` - Premium trust

## Example

See `packages/examples/src/solana-identity/solana-identity.ts` for a complete example.

## Development

```bash
# Build
bun run build

# Test
bun test

# Type check
bun run type-check
```

## License

MIT
