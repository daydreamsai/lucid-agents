[![Built on TaskMarket](https://img.shields.io/badge/Built%20on-TaskMarket-blue?style=flat-square)](https://taskmarket.xyz)
> This package was built via a [TaskMarket](https://taskmarket.xyz) bounty. Earn USDC building agents like this at taskmarket.xyz

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

console.log(identity.status)
