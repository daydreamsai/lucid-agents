# Wallet Connectors Guide

This guide explains how to use wallet connectors with the Lucid Agents SDK. Wallet connectors allow you to integrate various wallet providers and signing mechanisms into your agent.

## Overview

The Lucid Agents SDK uses a flexible connector system that supports:

- **Local wallets** - Private key-based wallets (EOA)
- **Server wallets** - Managed wallets (e.g., thirdweb server wallets)
- **Custom signers** - Any wallet that implements the compatible interface

All wallet connectors implement the `WalletConnector` interface, which provides:

- `signChallenge()` - Sign authentication challenges
- `getWalletMetadata()` - Get wallet metadata (address, chain, etc.)
- `getAddress()` - Get the wallet address
- `supportsCaip2()` - Check chain support

## Wallet Types

### Local Wallets (Private Key)

Local wallets use a private key for signing. They're simple and work offline.

**Configuration:**

```typescript
import { wallets } from '@lucid-agents/wallet';

const agent = await createAgent({ ... })
  .use(wallets({
    config: {
      agent: {
        type: 'local',
        privateKey: process.env.PRIVATE_KEY,
        provider: 'local',
      },
    },
  }))
  .build();
```

**Environment Variables:**

```bash
AGENT_WALLET_TYPE=local
AGENT_WALLET_PRIVATE_KEY=0x...
```

### Local Wallets (Custom Signer)

You can also use a custom signer instead of a private key. This is useful for integrating with external wallet SDKs.

**Configuration:**

```typescript
import { wallets, createSignerConnector } from '@lucid-agents/wallet';

// Create a signer from any compatible wallet
const signer = createSignerConnector({
  address: '0x...',
  signMessage: async (msg) => { /* sign */ },
  signTypedData: async (data) => { /* sign */ },
});

const agent = await createAgent({ ... })
  .use(wallets({
    config: {
      agent: {
        type: 'local',
        signer,
        provider: 'custom',
      },
    },
  }))
  .build();
```

## thirdweb Server Wallets

thirdweb server wallets are managed by thirdweb Engine - no private key management needed! Perfect for production agents. The SDK automatically initializes the wallet on first use.

### Prerequisites

1. **thirdweb Account**: Sign up at [thirdweb.com](https://thirdweb.com)
2. **Secret Key**: Get your project secret key from the thirdweb dashboard
3. **Client ID**: Your thirdweb project client ID (optional, required for JWT secret keys)
4. **Chain ID**: The chain ID where the wallet will operate (e.g., `84532` for Base Sepolia)

### Installation

```bash
bun add thirdweb
```

> **Note:** The thirdweb Engine wallet connector requires `thirdweb` version `^5.84.0` or higher so the Engine APIs used by the connector are available. Make sure your project depends on at least that version.

### Creating a Server Wallet

The SDK will automatically create the wallet if it doesn't exist when you first use it. You can also create it manually:

#### Option 1: Via Dashboard (Recommended)

1. Go to your thirdweb project dashboard
2. Navigate to **Transactions** → **Server Wallets**
3. Click **Create** and assign a label (e.g., `agent-wallet`)

#### Option 2: Via Engine SDK

```typescript
import { createThirdwebClient, Engine } from 'thirdweb';

const client = createThirdwebClient({
  secretKey: process.env.THIRDWEB_SECRET_KEY!,
  clientId: process.env.THIRDWEB_CLIENT_ID,
});

const wallet = await Engine.createServerWallet({
  client,
  label: 'agent-wallet',
});
```

### Integration Example

```typescript
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { wallets } from '@lucid-agents/wallet';
import { baseSepolia } from 'thirdweb/chains';

const agent = await createAgent({
  name: 'my-agent',
  version: '0.1.0',
  description: 'Agent using thirdweb Engine server wallet',
})
  .use(http())
  .use(
    wallets({
      config: {
        agent: {
          type: 'thirdweb',
          secretKey: process.env.THIRDWEB_SECRET_KEY!,
          clientId: process.env.THIRDWEB_CLIENT_ID,
          walletLabel: process.env.THIRDWEB_WALLET_LABEL || 'agent-wallet',
          chainId: baseSepolia.id, // 84532
        },
      },
    })
  )
  .build();

// Wallet is automatically initialized on first use
const address = await agent.wallets?.agent?.connector.getAddress();
console.log('Wallet address:', address);
```

### Environment Variables

```bash
# Required
THIRDWEB_SECRET_KEY=your_secret_key
THIRDWEB_CHAIN_ID=84532  # Base Sepolia

# Optional
THIRDWEB_CLIENT_ID=your_client_id  # Required for JWT secret keys
THIRDWEB_WALLET_LABEL=agent-wallet
AGENT_WALLET_TYPE=thirdweb  # Can also use AGENT_WALLET_ prefix
```

### Using Environment Variables

You can configure thirdweb wallets entirely via environment variables:

```typescript
import { wallets, walletsFromEnv } from '@lucid-agents/wallet';

const agent = await createAgent({ ... })
  .use(wallets({ config: walletsFromEnv() }))
  .build();
```

The following environment variables are supported:

- `THIRDWEB_SECRET_KEY` or `AGENT_WALLET_SECRET_KEY` - Required
- `THIRDWEB_CLIENT_ID` or `AGENT_WALLET_CLIENT_ID` - Optional (required for JWT)
- `THIRDWEB_WALLET_LABEL` or `AGENT_WALLET_LABEL` - Optional (defaults to `agent-wallet`)
- `THIRDWEB_CHAIN_ID` or `AGENT_WALLET_CHAIN_ID` - Required (defaults to `84532` for Base Sepolia)
- `AGENT_WALLET_TYPE=thirdweb` - Set wallet type to thirdweb

## Generic Signer Connector

The `createSignerConnector` function works with any wallet that implements the `CompatibleWallet` interface. This makes it easy to integrate with other wallet providers.

### CompatibleWallet Interface

```typescript
interface CompatibleWallet {
  address?: string;                    // Wallet address (property)
  getAddress?: () => Promise<string>;  // Or method
  signMessage: (message: string | Uint8Array) => Promise<string>;
  signTypedData?: (data: {...}) => Promise<string>;  // Optional
  signTransaction?: (tx: {...}) => Promise<`0x${string}`>;  // Optional
}
```

### Example: Custom Wallet Integration

```typescript
import { createSignerConnector } from '@lucid-agents/wallet';

// Create a signer from any compatible wallet
const myWallet = {
  address: '0x742d35Cc6634C0532925a3b8D43C67B8c8B3E9C6',
  signMessage: async (message) => {
    // Your signing logic
    return signature;
  },
  signTypedData: async (data) => {
    // Your typed data signing logic
    return signature;
  },
};

const signer = createSignerConnector(myWallet);

// Use with agent
const agent = await createAgent({ ... })
  .use(wallets({
    config: {
      agent: {
        type: 'local',
        signer,
        provider: 'my-custom-wallet',
      },
    },
  }))
  .build();
```

## Available Connectors

### LocalEoaWalletConnector

Connects local EOA (Externally Owned Account) wallets using a private key or custom signer.

**Use when:**

- You have a private key
- You want to use a custom signer
- You need simple, offline signing

### ThirdwebWalletConnector

Connects to thirdweb Engine server wallets. Automatically initializes the wallet on first use and converts it to a viem wallet client internally using thirdweb's viem adapter.

**Use when:**

- You want managed server wallets without private key management
- You're using thirdweb Engine for wallet infrastructure
- You need production-ready wallet management

### ServerOrchestratorWalletConnector

Connects to server-orchestrated wallets (e.g., Lucid wallet service).

**Use when:**

- You're using a wallet service API
- You need remote signing capabilities
- You want centralized wallet management

### Signer Connector (Generic)

Converts any compatible wallet interface to a `LocalEoaSigner`.

**Use when:**

- Integrating with other wallet SDKs
- You have a custom wallet implementation
- You want to use external wallet providers

## How It Works

### Connector Architecture

```
External Wallet (thirdweb, custom, etc.)
    ↓
createSignerConnector() → LocalEoaSigner
    ↓
LocalEoaWalletConnector → WalletConnector
    ↓
Agent Runtime → Uses for signing challenges, transactions
```

### Signer Interface

All signers implement `LocalEoaSigner`:

```typescript
interface LocalEoaSigner {
  signMessage(message: string | Uint8Array): Promise<string>;
  signTypedData?(payload: TypedDataPayload): Promise<string>;
  signTransaction?(transaction: Transaction): Promise<`0x${string}`>;
  getAddress?(): Promise<string | null>;
}
```

### Wallet Connector Interface

All connectors implement `WalletConnector`:

```typescript
interface WalletConnector {
  signChallenge(challenge: AgentChallenge): Promise<string>;
  getWalletMetadata(): Promise<WalletMetadata | null>;
  getAddress?(): Promise<string | null>;
  supportsCaip2?(caip2: string): boolean | Promise<boolean>;
}
```

## Environment-Based Configuration

You can configure wallets via environment variables:

```bash
# Local wallet with private key
AGENT_WALLET_TYPE=local
AGENT_WALLET_PRIVATE_KEY=0x...

# Or use walletsFromEnv helper
import { wallets, walletsFromEnv } from '@lucid-agents/wallet';

const agent = await createAgent({ ... })
  .use(wallets({ config: walletsFromEnv() }))
  .build();
```

## Best Practices

1. **Never commit private keys** - Use environment variables
2. **Use server wallets for production** - Better security and key management
3. **Test with local wallets** - Faster iteration during development
4. **Use signer connectors for integrations** - Easier to switch wallet providers

## Examples

- [thirdweb Wallets](../packages/examples/src/wallet/thirdweb-engine-wallets.ts) - thirdweb Engine server wallet integration

## See Also

- [Wallet Types](../types/src/wallets/index.ts) - Type definitions
- [Connector Implementations](./src/connectors/) - Connector source code
- [thirdweb Documentation](https://portal.thirdweb.com/wallets) - thirdweb wallet docs
