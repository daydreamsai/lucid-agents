# @lucid-agents/identity-solana

Solana identity for the Lucid SDK, mirroring the [`@lucid-agents/identity`](../identity) (EVM) API.

Registers Solana agents on the **8004-solana** on-chain program (the Solana analog of ERC-8004), produces CAIP-10 registration entries compatible with the `@lucid-agents/types/identity` `TrustConfig`, and integrates with the Lucid agent manifest via the `.use()` extension pattern.

## Installation

```bash
bun add @lucid-agents/identity-solana @solana/web3.js
```

> **Peer dependency:** `@solana/web3.js` (^1.95.0) must be installed in your project. It is never bundled into EVM packages.

## Quick Start

### 1. Set Environment Variables

```bash
AGENT_DOMAIN=my-agent.example.com
SOLANA_PRIVATE_KEY='[1,2,3,...,64]'   # JSON array — solana-keygen JSON format
SOLANA_CLUSTER=devnet                  # mainnet-beta | devnet | testnet
SOLANA_RPC_URL=https://api.devnet.solana.com   # optional, uses cluster default
IDENTITY_AUTO_REGISTER=true
```

### 2. Use with Lucid Agent Builder

```ts
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { identitySolana, identitySolanaFromEnv } from '@lucid-agents/identity-solana';

const agent = await createAgent({
  name: 'my-agent',
  version: '1.0.0',
})
  .use(http())
  .use(identitySolana({ config: identitySolanaFromEnv() }))
  .build();

// agent.trust now contains Solana CAIP-10 registration entries
```

### 3. Imperative Registration

```ts
import { createSolanaAgentIdentity } from '@lucid-agents/identity-solana';

const identity = await createSolanaAgentIdentity({
  domain: 'my-agent.example.com',
  autoRegister: true,
  cluster: 'devnet',
});

console.log(identity.status);
// "Successfully registered agent in Solana identity registry (tx: ...)"

console.log(identity.record?.agentId);   // numeric agent ID
console.log(identity.trust?.registrations);  // CAIP-10 entries for manifest
```

## API

### `identitySolana(options?)` → `Extension`

Lucid SDK extension. Attach with `.use(identitySolana({ config }))`.

```ts
identitySolana({
  config: {
    trust?: TrustConfig;       // Pre-built trust (skips registry call)
    domain?: string;           // Falls back to AGENT_DOMAIN env
    autoRegister?: boolean;    // Falls back to IDENTITY_AUTO_REGISTER env
    cluster?: string;          // Falls back to SOLANA_CLUSTER env
    rpcUrl?: string;           // Falls back to SOLANA_RPC_URL env
    skipSend?: boolean;        // For browser wallets that sign externally
  }
})
```

### `identitySolanaFromEnv(overrides?)` → `SolanaIdentityConfig`

Read config from environment variables (mirrors `identityFromEnv()` from `@lucid-agents/identity`).

| Env variable             | Default       | Description                                        |
|--------------------------|---------------|----------------------------------------------------|
| `AGENT_DOMAIN`           | —             | Agent domain for registration URI                  |
| `SOLANA_CLUSTER`         | `mainnet-beta`| Solana cluster                                     |
| `SOLANA_RPC_URL`         | cluster URL   | Custom RPC endpoint                                |
| `SOLANA_PRIVATE_KEY`     | —             | JSON array of secret key bytes                     |
| `IDENTITY_AUTO_REGISTER`      | `false`       | Auto-register if not found                         |
| `SOLANA_IDENTITY_PROGRAM_ID` | built-in  | Override identity program ID                       |
| `SOLANA_REPUTATION_PROGRAM_ID` | built-in | Override reputation program ID                    |

### `createSolanaAgentIdentity(options)` → `Promise<SolanaAgentIdentity>`

Main init function. Mirrors `createAgentIdentity()` from `@lucid-agents/identity`.

```ts
const identity = await createSolanaAgentIdentity({
  domain: 'my-agent.example.com',
  autoRegister: true,
  cluster: 'devnet',
  privateKey: process.env.SOLANA_PRIVATE_KEY,  // JSON array
  trustModels: ['feedback', 'inference-validation'],
  skipSend: false,  // true for browser wallets
});
```

Returns `SolanaAgentIdentity`:
```ts
{
  status: string;
  didRegister?: boolean;
  isNewRegistration?: boolean;
  transactionSignature?: string;
  record?: SolanaIdentityRecord;
  trust?: TrustConfig;       // Compatible with @lucid-agents/types/identity
  domain?: string;
  clients?: {
    identity: SolanaIdentityRegistryClient;
    reputation: SolanaReputationRegistryClient;
  };
}
```

### `registerSolanaAgent(options)` → `Promise<SolanaAgentIdentity>`

Convenience wrapper that forces `autoRegister: true`.

### `getSolanaTrustConfig(identity)` → `TrustConfig | undefined`

Extract trust config from a `SolanaAgentIdentity`. Mirrors `getTrustConfig()` from `@lucid-agents/identity`.

### `createAgentCardWithSolanaIdentity(card, trustConfig)` → `AgentCardWithEntrypoints`

Merge Solana trust into the agent card. Immutable — returns a new card. Mirrors `createAgentCardWithIdentity()` from `@lucid-agents/identity`.

### Registry Clients

#### `SolanaIdentityRegistryClient`

```ts
// Register a new agent
await identity.clients.identity.register({ agentURI, skipSend? });

// Look up by ID
await identity.clients.identity.get(agentId);  // → SolanaIdentityRecord | null

// Look up by domain
await identity.clients.identity.getByDomain('my-agent.example.com');

// Revoke
await identity.clients.identity.revoke(agentId);
```

#### `SolanaReputationRegistryClient`

```ts
// Give feedback (mirrors EVM reputation.giveFeedback)
await identity.clients.reputation.giveFeedback({
  toAgentId: 1,
  value: 90,
  valueDecimals: 0,
  tag1: 'reliable',
  tag2: 'fast',
  endpoint: 'https://other-agent.example.com',
  feedbackURI: '',       // optional IPFS URI
  skipSend: false,       // true for browser wallets
});

// Get reputation summary
const summary = await identity.clients.reputation.getSummary(1);
// { value: 90, valueDecimals: 0, count: 1 }

// Get all feedback
await identity.clients.reputation.getAllFeedback(1);

// Revoke feedback
await identity.clients.reputation.revokeFeedback({ agentId: 1, feedbackIndex: 0 });
```

## Trust Config Format

The trust config produced by this package uses Solana CAIP-10 identifiers, so it is fully compatible with `@lucid-agents/types/identity TrustConfig` and the Lucid manifest system:

```json
{
  "registrations": [
    {
      "agentId": "42",
      "agentRegistry": "solana:devnet:AgentId11111111111111111111111111111111111111",
      "agentAddress": "solana:devnet:9yPGxVrYi7C5JLMGjEZhK8qQ4tn7SzMWwQHvz3vGJCKz"
    }
  ],
  "trustModels": ["feedback", "inference-validation"]
}
```

## Browser Wallets / skipSend

For browser wallets that sign transactions externally (Phantom, Backpack, etc.), set `skipSend: true`. The client will build the transaction but return a `null` signature instead of broadcasting. You can then sign and send via the browser wallet's `signAndSendTransaction` API.

```ts
const identity = await createSolanaAgentIdentity({
  domain: 'my-agent.example.com',
  autoRegister: true,
  cluster: 'devnet',
  skipSend: true,   // Build transaction but don't send
});
// identity.transactionSignature === undefined
// Caller is responsible for signing and broadcasting
```

## Architecture

```text
packages/identity-solana/
├── src/
│   ├── index.ts            # Public exports
│   ├── types.ts            # SolanaIdentityRecord, SolanaAgentIdentity, TrustConfig helpers
│   ├── env.ts              # identitySolanaFromEnv(), parseSolanaPrivateKey()
│   ├── init.ts             # createSolanaAgentIdentity(), registerSolanaAgent()
│   ├── extension.ts        # identitySolana() Extension, createAgentCardWithSolanaIdentity()
│   └── registries/
│       ├── identity.ts     # SolanaIdentityRegistryClient (8004-solana identity program)
│       ├── reputation.ts   # SolanaReputationRegistryClient (8004-solana reputation program)
│       └── bs58-shim.ts    # Lightweight bs58 for internal use
└── src/__tests__/
    ├── env.test.ts          # parseSolanaPrivateKey, normalizeCluster, identitySolanaFromEnv
    ├── types.test.ts        # toRegistrationEntry, buildSolanaTrustConfig
    ├── manifest.test.ts     # createAgentCardWithSolanaIdentity
    ├── init.test.ts         # createSolanaAgentIdentity (mocked Solana SDK)
    ├── extension.test.ts    # identitySolana() extension contract
    ├── registry-identity.test.ts    # SolanaIdentityRegistryClient
    └── registry-reputation.test.ts  # SolanaReputationRegistryClient
```

## On-Chain Program (8004-solana)

The identity and reputation programs are the Solana analogs of ERC-8004. Account layout:

**Identity account** (PDA: `[b"agent", agentId.to_le_bytes()]`):
```text
[is_initialized(1), owner(32), agentId(4), uri_len(4), uri(N)]
```

**Counter account** (PDA: `[b"counter"]`):
```text
[count(4)]
```

**Feedback account** (PDA: `[b"feedback", agentId.to_le_bytes()]`):
```text
[count(4), entries[is_revoked(1), from(32), value(1), valueDecimals(1), timestamp(8), ...]]
```

Program IDs are configurable via `SOLANA_IDENTITY_PROGRAM_ID` and `SOLANA_REPUTATION_PROGRAM_ID` environment variables.

## Links

- [@lucid-agents/identity](../identity) — EVM equivalent
- [ERC-8004 Specification](https://eips.ethereum.org/EIPS/eip-8004)
- [Lucid SDK Documentation](../../README.md)
- [CAIP-10](https://chainagnostic.org/CAIPs/caip-10)

## License

MIT
