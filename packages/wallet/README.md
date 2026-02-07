# @lucid-agents/wallet

Wallet SDK for agent and developer wallet management. Supports multiple wallet connectors including local EOA, Thirdweb Engine, viem, and server-orchestrated wallets.

## Installation

```bash
bun add @lucid-agents/wallet
```

## Usage

### As an Extension

```typescript
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { wallets, walletsFromEnv } from '@lucid-agents/wallet';

const agent = await createAgent({
  name: 'my-agent',
  version: '1.0.0',
})
  .use(http())
  .use(wallets({ config: walletsFromEnv() }))
  .build();

// Access wallets via agent.wallets
```

### Standalone Wallet Creation

```typescript
import { createAgentWallet, createDeveloperWallet } from '@lucid-agents/wallet';

// Local EOA wallet
const agentWallet = await createAgentWallet({
  type: 'local',
  privateKey: process.env.AGENT_WALLET_PRIVATE_KEY,
});

// Thirdweb Engine wallet
const devWallet = await createDeveloperWallet({
  type: 'thirdweb',
  secretKey: process.env.THIRDWEB_SECRET_KEY,
  clientId: process.env.THIRDWEB_CLIENT_ID,
  walletLabel: 'dev-wallet',
  chainId: 84532,
});
```

### Environment Variables

`walletsFromEnv()` reads:

- `AGENT_WALLET_PRIVATE_KEY` - Private key for local EOA agent wallet
- `AGENT_WALLET_SECRET_KEY` - Thirdweb secret key for Engine wallets
- `AGENT_WALLET_CLIENT_ID` - Thirdweb client ID

## Wallet Connectors

- **`LocalEoaWalletConnector`** - Simple private key wallet (EVM)
- **`ThirdwebWalletConnector`** - Thirdweb Engine managed wallet
- **`ViemWalletConnector`** - Wrap any viem WalletClient
- **`ServerOrchestratorWalletConnector`** - Server-managed wallet with access tokens
- **`createSignerConnector`** - Create a connector from any compatible signer

## Exports

- `wallets()` - Extension function
- `walletsFromEnv()` - Load config from environment variables
- `createAgentWallet()` / `createDeveloperWallet()` - Standalone wallet creation
- `createWalletsRuntime()` - Create wallet runtime directly
- Connector classes and utilities

## Related Packages

- [`@lucid-agents/core`](../core/README.md) - Core agent runtime
- [`@lucid-agents/payments`](../payments/README.md) - Payment processing (uses wallets for signing)
- [`@lucid-agents/identity`](../identity/README.md) - Identity registration (uses wallets for signing)
