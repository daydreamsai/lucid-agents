# Identity Agent Template - AI Coding Guide

This guide helps AI coding agents understand and extend this ERC-8004 identity-enabled agent project.

## Project Overview

This is a Bun HTTP agent with ERC-8004 identity registration and trust metadata. It combines `@lucid-agents/agent-kit` for the agent framework and `@lucid-agents/agent-kit-identity` for on-chain identity management.

**Key Files:**
- `src/agent.ts` - Agent definition with identity setup and entrypoints
- `src/index.ts` - Bun HTTP server setup
- `.env` - Configuration (domain, RPC URLs, private key, etc.)

**Key Dependencies:**
- `@lucid-agents/agent-kit` - Agent app framework
- `@lucid-agents/agent-kit-identity` - ERC-8004 identity helpers
- `viem` - Ethereum client library
- `zod` - Schema validation

## Build & Development Commands

```bash
# Install dependencies
bun install

# Start in development mode (watch mode)
bun run dev

# Start once (production)
bun run start

# Type check
bunx tsc --noEmit
```

## Template Arguments

This template accepts the following configuration arguments (see `template.schema.json`):

- `AGENT_NAME` - Set automatically from project name
- `AGENT_DESCRIPTION` - Human-readable description
- `AGENT_VERSION` - Semantic version
- `AGENT_DOMAIN` - Domain that hosts your agent (e.g., "agent.example.com")
- `PAYMENTS_FACILITATOR_URL` - x402 facilitator endpoint
- `PAYMENTS_NETWORK` - Network identifier
- `PAYMENTS_RECEIVABLE_ADDRESS` - Address for receiving payments
- `PAYMENTS_DEFAULT_PRICE` - Default price in base units
- `RPC_URL` - Blockchain RPC endpoint (e.g., "https://sepolia.base.org")
- `CHAIN_ID` - Chain ID (e.g., "84532" for Base Sepolia)
- `IDENTITY_AUTO_REGISTER` - Auto-register on ERC-8004 registry ("true"/"false")
- `PRIVATE_KEY` - Wallet private key (required for on-chain operations)

## What is ERC-8004?

ERC-8004 is a standard for on-chain agent identity and trust. It provides:

1. **Identity Registry** - Register your agent with a domain → address mapping
2. **Reputation Registry** - Track agent reputation scores and attestations
3. **Validation Registry** - Store validation requests and responses

## How Identity Bootstrap Works

The template automatically sets up identity when the agent starts:

```typescript
// From src/agent.ts
const identity = await createAgentIdentity({
  domain: process.env.AGENT_DOMAIN,
  autoRegister: process.env.IDENTITY_AUTO_REGISTER === "true",
});

if (identity.didRegister) {
  console.log("Registered agent on-chain!");
  console.log("Transaction:", identity.transactionHash);
} else if (identity.trust) {
  console.log("Found existing registration");
  console.log("Agent ID:", identity.record?.agentId);
}
```

This:
- Checks if the agent is already registered
- If `autoRegister` is true and not registered, registers on-chain
- Retrieves trust configuration for the manifest

## How to Use the Identity Module

### Manual Registration

```typescript
import {
  createAgentIdentity,
  getTrustConfig,
} from "@lucid-agents/agent-kit-identity";

const identity = await createAgentIdentity({
  domain: "agent.example.com",
  autoRegister: true, // Will register if not already registered
});

// Check registration status
if (identity.record) {
  console.log("Agent ID:", identity.record.agentId);
  console.log("Address:", identity.record.agentAddress);
  console.log("Domain:", identity.record.agentDomain);
}
```

### Working with the Identity Registry

```typescript
// Access the identity registry client
import { identityClient } from "./agent";

// Query by domain
const record = await identityClient?.resolveByDomain("agent.example.com");
if (record) {
  console.log("Found agent:", record.agentId);
}

// Query by address
const recordByAddress = await identityClient?.resolveByAddress("0x...");

// Query by agent ID
const recordById = await identityClient?.resolveById(1);
```

### Working with the Reputation Registry

```typescript
// Access the reputation registry client
import { reputationClient } from "./agent";

// Get reputation score
const reputation = await reputationClient?.getReputation(agentId);
console.log("Score:", reputation?.score);
console.log("Attestations:", reputation?.attestationCount);

// Submit reputation (requires appropriate permissions)
await reputationClient?.submitReputation({
  agentId: 1,
  score: 95,
  attestor: "0x...",
});
```

### Working with the Validation Registry

```typescript
// Access the validation registry client
import { validationClient } from "./agent";

// Submit a validation request
const requestId = await validationClient?.submitValidationRequest({
  agentId: 1,
  requestData: "validation data here",
  requestor: "0x...",
});

// Get validation request
const request = await validationClient?.getValidationRequest(requestId);

// Submit validation response
await validationClient?.submitValidationResponse({
  requestId,
  responseData: "validation result",
  validator: "0x...",
});
```

## How to Add Trust-Aware Entrypoints

### Basic Entrypoint with Identity Info

```typescript
addEntrypoint({
  key: "verify-identity",
  description: "Return agent identity information",
  output: z.object({
    agentId: z.number().optional(),
    domain: z.string().optional(),
    address: z.string().optional(),
    isRegistered: z.boolean(),
  }),
  handler: async () => {
    const { identityClient } = await import("./agent");

    // Get this agent's identity
    const domain = process.env.AGENT_DOMAIN;
    const record = domain
      ? await identityClient?.resolveByDomain(domain)
      : null;

    return {
      output: {
        agentId: record?.agentId,
        domain: record?.agentDomain,
        address: record?.agentAddress,
        isRegistered: !!record,
      },
    };
  },
});
```

### Entrypoint that Checks Caller Identity

```typescript
addEntrypoint({
  key: "trusted-operation",
  description: "Operation that requires caller to be registered",
  input: z.object({
    callerAddress: z.string(),
    data: z.string(),
  }),
  output: z.object({
    result: z.string(),
    callerReputation: z.number().optional(),
  }),
  handler: async ({ input }) => {
    const { identityClient, reputationClient } = await import("./agent");

    // Verify caller is registered
    const callerRecord = await identityClient?.resolveByAddress(
      input.callerAddress as `0x${string}`
    );

    if (!callerRecord) {
      throw new Error("Caller not registered on identity registry");
    }

    // Get caller reputation
    const reputation = await reputationClient?.getReputation(
      callerRecord.agentId
    );

    if (reputation && reputation.score < 50) {
      throw new Error("Caller reputation too low");
    }

    // Perform trusted operation
    const result = `Processed data for agent ${callerRecord.agentId}`;

    return {
      output: {
        result,
        callerReputation: reputation?.score,
      },
    };
  },
});
```

### Entrypoint for Validation Workflow

```typescript
addEntrypoint({
  key: "request-validation",
  description: "Submit a validation request for this agent",
  input: z.object({
    taskDescription: z.string(),
    requestorAddress: z.string(),
  }),
  output: z.object({
    requestId: z.number(),
    status: z.string(),
  }),
  handler: async ({ input }) => {
    const { validationClient, identityClient } = await import("./agent");

    // Get this agent's ID
    const domain = process.env.AGENT_DOMAIN;
    const record = domain
      ? await identityClient?.resolveByDomain(domain)
      : null;

    if (!record) {
      throw new Error("Agent not registered");
    }

    // Submit validation request
    const requestId = await validationClient?.submitValidationRequest({
      agentId: record.agentId,
      requestData: input.taskDescription,
      requestor: input.requestorAddress as `0x${string}`,
    });

    return {
      output: {
        requestId: requestId || 0,
        status: "submitted",
      },
    };
  },
});
```

## Trust Configuration

The agent's trust metadata is automatically included in the manifest:

```typescript
const trustConfig = getTrustConfig(identity);

const { app, addEntrypoint } = createAgentApp(
  { /* meta */ },
  {
    useConfigPayments: true,
    trust: trustConfig, // Automatically populated
  }
);
```

This adds to `/.well-known/agent.json`:
- `registrations[]` - Your identity registration(s)
- `trustModels[]` - Supported trust models
- `ValidationRequestsURI` - Where validation requests are stored
- `ValidationResponsesURI` - Where validation responses are stored
- `FeedbackDataURI` - Where feedback data is stored

## Environment Variables Guide

Required in `.env`:

```bash
# Agent metadata
AGENT_NAME=my-identity-agent
AGENT_VERSION=0.1.0
AGENT_DESCRIPTION=Verifiable agent with on-chain identity
AGENT_DOMAIN=agent.example.com

# Blockchain configuration
RPC_URL=https://sepolia.base.org
CHAIN_ID=84532
PRIVATE_KEY=0x...  # Required for on-chain operations

# Identity configuration
IDENTITY_AUTO_REGISTER=true

# Payment configuration
PAYMENTS_FACILITATOR_URL=https://facilitator.daydreams.systems
PAYMENTS_NETWORK=base-sepolia
PAYMENTS_RECEIVABLE_ADDRESS=0x...
PAYMENTS_DEFAULT_PRICE=1000
```

## Testing Your Agent

### Check Identity Registration

```bash
# Start the agent
bun run dev

# Check if registered (look for console output)
# "Registered agent on-chain!" or "Found existing registration"

# Test identity verification entrypoint
curl -X POST http://localhost:3000/entrypoints/verify-identity/invoke \
  -H "Content-Type: application/json" \
  -d '{"input": {}}'
```

### View Trust Metadata in Manifest

```bash
curl http://localhost:3000/.well-known/agent.json | jq '.registrations, .trustModels'
```

### Test with Another Agent's Address

```bash
curl -X POST http://localhost:3000/entrypoints/trusted-operation/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "callerAddress": "0x...",
      "data": "test"
    }
  }'
```

## Common Patterns

### Lazy Identity Loading

```typescript
let cachedIdentity: any = null;

handler: async ({ input }) => {
  if (!cachedIdentity) {
    const { identityClient } = await import("./agent");
    const domain = process.env.AGENT_DOMAIN;
    cachedIdentity = await identityClient?.resolveByDomain(domain!);
  }

  // Use cachedIdentity
  return {
    output: { agentId: cachedIdentity?.agentId },
  };
}
```

### Cross-Agent Trust Verification

```typescript
async function verifyAgentTrust(agentAddress: string): Promise<boolean> {
  const { identityClient, reputationClient } = await import("./agent");

  // Check if agent is registered
  const record = await identityClient?.resolveByAddress(
    agentAddress as `0x${string}`
  );
  if (!record) return false;

  // Check reputation threshold
  const reputation = await reputationClient?.getReputation(record.agentId);
  return reputation ? reputation.score >= 70 : false;
}

addEntrypoint({
  key: "collaborate",
  input: z.object({
    partnerAddress: z.string(),
  }),
  handler: async ({ input }) => {
    const isTrusted = await verifyAgentTrust(input.partnerAddress);
    if (!isTrusted) {
      throw new Error("Partner agent not trusted");
    }

    // Proceed with collaboration
    return { output: { status: "collaboration initiated" } };
  },
});
```

## On-Chain Registration Details

When `IDENTITY_AUTO_REGISTER=true` and the agent is not registered:

1. The agent reads `AGENT_DOMAIN` and `PRIVATE_KEY` from `.env`
2. Creates a wallet from the private key
3. Connects to the blockchain via `RPC_URL`
4. Calls the Identity Registry contract to register
5. Stores the domain → address mapping on-chain
6. Transaction hash is logged to console

**Gas costs**: Registration requires gas fees. Ensure the wallet has sufficient balance for the target network.

## Troubleshooting

### "Agent not registered"

Ensure:
1. `IDENTITY_AUTO_REGISTER=true` in `.env`
2. `PRIVATE_KEY` is set and has gas for transactions
3. `RPC_URL` and `CHAIN_ID` are correct
4. Network is supported (check Identity Registry deployment)

### Registration transaction fails

Check:
1. Wallet has sufficient gas
2. RPC URL is accessible
3. Domain is not already registered by another address
4. Private key format is correct (0x-prefixed hex)

### Can't query other agents

Verify:
1. RPC URL is correct and responsive
2. Identity Registry contract address is correct for the network
3. Target agent is actually registered on-chain

### Trust metadata not appearing in manifest

Ensure:
1. Identity is initialized before creating the app
2. `getTrustConfig(identity)` is called
3. Trust config is passed to `createAgentApp` options

## Security Considerations

1. **Private Key Security**: Never commit `.env` to version control
2. **Domain Verification**: Ensure you control the domain you register
3. **Reputation**: Monitor your agent's on-chain reputation
4. **Trust Thresholds**: Set appropriate reputation thresholds for operations
5. **Validation**: Implement proper validation workflows for critical tasks

## Next Steps

1. **Configure environment** - Set domain, RPC URL, and private key
2. **Test registration** - Run agent and verify on-chain registration
3. **Add trust-aware entrypoints** - Implement features that check identity
4. **Monitor reputation** - Track your agent's on-chain reputation
5. **Deploy** - Use Bun-compatible hosting with secure key management

## Additional Resources

- [ERC-8004 Specification](https://github.com/ethereum/ERCs/issues/8004)
- [@lucid-agents/agent-kit-identity docs](../../../agent-kit-identity/README.md)
- [viem documentation](https://viem.sh/)
- [Base network docs](https://docs.base.org/)

