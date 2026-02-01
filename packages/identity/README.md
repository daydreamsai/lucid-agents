# @lucid-agents/identity

ERC-8004 identity helpers for Lucid agents. Register your agent on the ERC-8004 registry and include verifiable on-chain identity in your agent manifest.

## What is ERC-8004?

[ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) is an Ethereum standard for an on-chain agent registry. In v1.0, agents are represented as **ERC-721 NFTs** with metadata stored off-chain.

### Key Concepts

- **Agent Identity**: Agents are NFTs - registering mints an NFT to your address
- **Registration file**: Agent registration JSON is hosted at your domain
- **Ownership**: Transfer the NFT to transfer agent ownership
- **On-Chain Verification**: Anyone can verify agent ownership via the blockchain

## What Can You Do?

This package enables you to:

- **Register Agent Identity**: Mint an ERC-721 NFT representing your agent on-chain with a verifiable domain
- **Build Trust**: Integrate verifiable identity into your agent's manifest so other agents and users can verify ownership
- **Manage Reputation**: Give and receive peer feedback through the reputation registry to build trust over time
- **Validate Work**: Request validation of your agent's work or validate other agents' outputs through the validation registry

## Installation

```bash
bun add @lucid-agents/identity
```

## Quick Start

### 1. Set Up Environment Variables

Create a `.env` file:

```bash
# Your agent's domain
AGENT_DOMAIN=my-agent.example.com

# Blockchain connection
# See "Supported Networks" section for all available chains
RPC_URL=https://sepolia.base.org
CHAIN_ID=84532  # Base Sepolia (default)

# Your wallet private key (for registration)
PRIVATE_KEY=0xYourPrivateKeyHere

# Optional: Auto-register if not found
REGISTER_IDENTITY=true
```

### 2. Register Your Agent

```typescript
import { createAgentIdentity } from '@lucid-agents/identity';

// Register with auto-configuration from env vars
const identity = await createAgentIdentity({
  autoRegister: true,
});

console.log(identity.status);
// "Successfully registered agent in ERC-8004 registry"

if (identity.didRegister) {
  console.log('Transaction:', identity.transactionHash);
  // The package will automatically log the registration JSON you need to host
}
```

### 3. Host Your Registration File

After successful registration, the package automatically generates and logs the registration JSON you need to host. Simply copy it and save it at:

```text
https://my-agent.example.com/.well-known/agent-registration.json
```

You can also generate a custom registration file using the helper:

```typescript
import { generateAgentRegistration } from '@lucid-agents/identity';

const registration = generateAgentRegistration(identity, {
  name: 'My Agent',
  description: 'An intelligent assistant',
  image: 'https://my-agent.example.com/og.png',
  services: [
    {
      id: 'a2a',
      type: 'a2a',
      serviceEndpoint:
        'https://my-agent.example.com/.well-known/agent-card.json',
    },
  ],
});

// Host this JSON at your domain
```

## Usage with Agent Kit

```typescript
import { createAgentIdentity, getTrustConfig } from '@lucid-agents/identity';
import { createAgentApp } from '@lucid-agents/core';

// 1. Create identity with all three registry clients
const identity = await createAgentIdentity({
  domain: 'my-agent.example.com',
  autoRegister: true,
});

// 2. Create agent with trust metadata
const { app, addEntrypoint } = createAgentApp(
  {
    name: 'my-agent',
    version: '1.0.0',
  },
  {
    trust: getTrustConfig(identity), // Include ERC-8004 identity
  }
);

// 3. Use registry clients for reputation and validation
if (identity.clients) {
  // Check reputation before hiring another agent
  const agentToHire = 42n;
  const reputation = await identity.clients.reputation.getSummary(agentToHire);

  const score =
    reputation.valueDecimals === 0
      ? Number(reputation.value)
      : Number(reputation.value) / 10 ** reputation.valueDecimals;
  if (score > 80) {
    console.log('Agent has good reputation, proceeding...');
  }
}
```

## Working with Registry Clients

`createAgentIdentity()` returns clients for all three ERC-8004 registries. These clients enable you to interact with the on-chain reputation and validation systems.

```typescript
const identity = await createAgentIdentity({ autoRegister: true });

// Access all three registry clients
identity.clients.identity; // Identity NFT management
identity.clients.reputation; // Peer feedback system
identity.clients.validation; // Work validation
```

### How to Manage Identity Metadata

Read and update agent metadata:

```typescript
const { identity: identityClient } = identity.clients;

// Read metadata
const metadata = await identityClient.getMetadata(myAgentId, 'version');
if (metadata) {
  console.log('Version:', new TextDecoder().decode(metadata));
}

// Update metadata
await identityClient.setMetadata(
  myAgentId,
  'version',
  new TextEncoder().encode('1.0.0')
);
```

### Transfer identity

The Identity Registry is ERC-721-like and **EVM-only**. You can transfer an identity token to another EVM address, or allow an approved spender to transfer on your behalf.

**Transfer (owner):** Transfer your identity token to another address. Uses `safeTransferFrom`; the signer must be the current owner.

```typescript
const { identity: identityClient } = identity.clients;

// Transfer identity to another EVM address (you must be the owner)
const txHash = await identityClient.transfer(recipientEvmAddress, myAgentId);
```

**TransferFrom (owner or approved spender):** Transfer a token from one address to another. The signer must be the current owner or an address approved via `approve` or `setApprovalForAll`.

```typescript
await identityClient.transferFrom(fromAddress, toAddress, agentId);
```

**Approve / setApprovalForAll:** Allow another address to transfer your identity token(s). After approval, that address can call `transferFrom`.

```typescript
// Approve a single token
await identityClient.approve(approvedAddress, myAgentId);

// Approve an operator for all your tokens
await identityClient.setApprovalForAll(operatorAddress, true);

// Read approved address for a token (no wallet required)
const approved = await identityClient.getApproved(myAgentId);
```

Addresses must be valid EVM (0x-prefixed) addresses; Solana addresses are not supported.

**Example A — Register then transfer:** Platform (e.g. server or CDP wallet) registers an identity, then transfers it to a user's EVM address:

```typescript
const result = await client.register({
  agentURI: 'https://my-agent.example.com/.well-known/agent-registration.json',
});
if (result.agentId) {
  await client.transfer(userEvmAddress, result.agentId);
}
```

**Example B — Transfer only:** Signer already owns an identity; transfer it to another EVM address:

```typescript
await client.transfer(recipientEvmAddress, agentId);
```

For Coinbase CDP (Lucid MCP / xgate), use a viem-compatible `WalletClient` backed by your CDP server account (same interface: `account.address`, `writeContract`). See the xgate-mcp-server adapter for the CDP pattern. Runnable scripts: `examples/register-then-transfer.ts`, `examples/transfer-only.ts`, and `examples/deploy-agent.ts` (register + optional transfer).

### How to Manage Reputation

Give and receive feedback on agent interactions:

```typescript
const { reputation } = identity.clients;

// Give feedback to another agent
await reputation.giveFeedback({
  toAgentId: 42n,
  value: 90, // integer; use valueDecimals for fixed-point
  valueDecimals: 0,
  tag1: 'reliable',
  tag2: 'fast',
  endpoint: 'https://my-agent.example.com/api', // Optional parameter (defaults to empty string if not provided)
  feedbackURI: 'ipfs://QmFeedbackDetails', // Optional, defaults to empty string
});

// Query reputation
const summary = await reputation.getSummary(42n);
const average =
  summary.valueDecimals === 0
    ? Number(summary.value)
    : Number(summary.value) / 10 ** summary.valueDecimals;
console.log(`Agent #42: ${average}/100 (${summary.count} reviews)`);

// Get all feedback
const feedback = await reputation.getAllFeedback(42n);

// Revoke feedback you gave
await reputation.revokeFeedback({
  agentId: 42n,
  feedbackIndex: 5n,
});

// Respond to feedback you received
await reputation.appendResponse({
  agentId: myAgentId,
  clientAddress: '0x...',
  feedbackIndex: 3n,
  responseUri: 'ipfs://QmMyResponse',
  responseHash: '0x...',
});
```

### How to Validate Work

> **Note**: Validation Registry is deprecated and under active development. It will be revised in a follow-up spec update later this year. The API has been updated to match the new ABI but remains deprecated.
> If `requestBody` is not provided, the client hashes `requestUri` for backward compatibility.

Request validation of your work or validate others:

```typescript
const { validation } = identity.clients;

if (validation) {
  // Create validation request (function renamed: createRequest → validationRequest)
  await validation.validationRequest({
    validatorAddress: '0x...',
    agentId: myAgentId,
    requestUri: 'ipfs://QmMyWork',
    // Prefer hashing the canonical request body (spec-compliant)
    requestBody: '{"input":"work-data"}',
    // Or pass requestHash directly if you already have one
    // requestHash: keccak256(toHex('work-data')),
  });

  // Submit validation response (function renamed: submitResponse → validationResponse)
  // Tag type changed: bytes32/Hex → string
  await validation.validationResponse({
    requestHash: '0xabc...',
    response: 1, // 1 = valid, 0 = invalid
    responseUri: 'ipfs://QmValidationReport',
    responseHash: '0x...',
    tag: 'validation', // Now a string, not bytes32
  });

  // Query validations (tag type changed: bytes32/Hex → string)
  const requests = await validation.getAgentValidations(myAgentId);
  const summary = await validation.getSummary(myAgentId, {
    tag: 'validation', // Now a string, not bytes32
  });
  console.log(`${summary.count} validations, avg: ${summary.avgResponse}`);
}
```

## Supported Networks

The package supports multiple EVM-compatible chains. Set `CHAIN_ID` and `RPC_URL` in your environment:

- Ethereum Mainnet (1)
- Sepolia Testnet (11155111)
- Base Mainnet (8453)
- Base Sepolia (84532) - default
- Arbitrum (42161)
- Optimism (10)
- Polygon (137)
- Polygon Amoy (80002)

## Examples

See the [`examples/`](./examples) directory for complete examples:

- [`register-then-transfer.ts`](./examples/register-then-transfer.ts) - Example A: Register an identity, then transfer it to a user's EVM address
- [`transfer-only.ts`](./examples/transfer-only.ts) - Example B: Transfer an existing identity token to another EVM address
- [`deploy-agent.ts`](./examples/deploy-agent.ts) - Deploy agent identity (register on ERC-8004 registry, optionally transfer to a user). Required env: `RPC_URL`, `CHAIN_ID`, `PRIVATE_KEY`, `AGENT_URI`. Optional: `TRANSFER_TO`. For CDP wallet, use a WalletClient backed by your CDP server account (see xgate-mcp-server).

## API Reference

### `createAgentIdentity(options)`

Main function to set up ERC-8004 identity for your agent.

**Options:**

```typescript
{
  // Agent domain (defaults to AGENT_DOMAIN env var)
  domain?: string;

  // Auto-register if not found (default: true)
  autoRegister?: boolean;

  // Blockchain configuration
  chainId?: number;  // Default: 84532 (Base Sepolia)
  rpcUrl?: string;  // Default: RPC_URL env var
  privateKey?: string;  // Default: PRIVATE_KEY env var

  // Trust configuration
  trustModels?: string[];  // Default: ["feedback", "inference-validation"]
  trustOverrides?: {
    validationRequestsUri?: string;
    validationResponsesUri?: string;
    feedbackDataUri?: string;
  };

  // Environment and logging
  env?: Record<string, string | undefined>;
  logger?: {
    info?(message: string): void;
    warn?(message: string, error?: unknown): void;
  };
}
```

**Returns:**

```typescript
{
  // Whether agent was newly registered
  didRegister?: boolean;
  isNewRegistration?: boolean;

  // Transaction hash (if registered)
  transactionHash?: string;

  // Agent record (if found/registered)
  record?: {
    agentId: bigint;
    owner: string;
    agentURI: string;
  };

  // Trust config for agent manifest
  trust?: TrustConfig;

  // Human-readable status message
  status: string;

  // Resolved domain
  domain?: string;
}
```

### `registerAgent(options)`

Convenience wrapper that forces `autoRegister: true`.

```typescript
const identity = await registerAgent({
  domain: 'my-agent.example.com',
});
```

### `getTrustConfig(identity)`

Extract just the trust config from an identity result.

```typescript
const identity = await createAgentIdentity({ autoRegister: true });
const trustConfig = getTrustConfig(identity);

// Use in createAgentApp
createAgentApp({ name: 'my-agent' }, { trust: trustConfig });
```

### `generateAgentRegistration(identity, options?)`

Generate the registration JSON to host at your domain. Automatically called after registration, but you can also use it to customize the registration file.

```typescript
const registration = generateAgentRegistration(identity, {
  name: 'My Agent',
  description: 'An intelligent assistant',
  image: 'https://my-agent.example.com/og.png',
  services: [
    {
      id: 'a2a',
      type: 'a2a',
      serviceEndpoint:
        'https://my-agent.example.com/.well-known/agent-card.json',
    },
  ],
});

// Save to: https://your-domain/.well-known/agent-registration.json
```

## How It Works

When you call `createAgentIdentity({ autoRegister: true })`:

1. Registers your agent on-chain (mints an NFT to your address)
2. Returns a trust config for your agent manifest
3. Provides clients for reputation and validation

You must host the registration file at: `https://{your-domain}/.well-known/agent-registration.json`

The trust config allows other agents to verify your identity and access reputation data.

## Troubleshooting

### "No ERC-8004 identity" Message

If you see this message, it means:

- Agent isn't registered yet (set `autoRegister: true`)
- Registry connection failed (check RPC_URL)
- Wallet not configured (check PRIVATE_KEY)

This is **normal** - your agent will run fine without on-chain identity, it just won't have verifiable trust metadata.

### Registration Succeeded but No Trust Config

After successful registration (`didRegister: true`), the package can't immediately verify the registration because ERC-8004 v1.0 doesn't support querying by domain. This is expected behavior.

**Solution**: Query by agent ID later, or trust that the transaction succeeded.

### Registration File Not Accessible

Make sure your registration file is:

1. Hosted at the exact URL: `https://{domain}/.well-known/agent-registration.json`
2. Returns valid JSON with `Content-Type: application/json`
3. Accessible over HTTPS (not HTTP)
4. Not blocked by CORS (if accessed from browsers)

## License

MIT

## Links

- [ERC-8004 Specification](https://eips.ethereum.org/EIPS/eip-8004)
- [ERC-8004 Reference Implementation](https://github.com/lucid-dreams-ai/erc-8004-contracts)
- [Agent Kit Documentation](https://github.com/lucid-dreams-ai/lucid-fullstack/tree/main/packages/core)
