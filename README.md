![info](./info.jpeg)

<div align="center">
  <h1>Lucid Agents</h1>
  <p><strong>The Protocol-Agnostic Multi-Runtime Framework for Building and Monetizing AI Agents</strong></p>
  <p>Build, deploy, and monetize autonomous AI agents with typed entrypoints, onchain identity, and built-in payment infrastructure.</p>
</div>

<div align="center">
  <a href="https://github.com/daydreamsai/lucid-agents/blob/master/LICENSE"><img src="https://img.shields.io/github/license/daydreamsai/lucid-agents?style=for-the-badge" alt="License"></a>
  <a href="https://www.npmjs.com/package/@lucid-agents/cli"><img src="https://img.shields.io/npm/v/@lucid-agents/cli?style=for-the-badge" alt="NPM Version"></a>
  <a href="https://github.com/daydreamsai/lucid-agents/actions"><img src="https://img.shields.io/github/actions/workflow/status/daydreamsai/lucid-agents/ci.yml?branch=master&style=for-the-badge" alt="CI Status"></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/runtime-bun-black?style=for-the-badge&logo=bun" alt="Bun"></a>
</div>

---

## What is Lucid Agents?

Lucid Agents is a TypeScript-first framework for building and monetizing AI agents. An agentic commerce and payments SDK. Build AI agents that sell services, facilitate monetary transactions, and participate in agent-to-agent marketplaces.

**Core Capabilities:**

- **Industry-Standard Protocols**: Native support for x402 (payments), A2A (agent-to-agent communication), and ERC-8004 (onchain identity). Build agents that work with the ecosystem
- **Bi-Directional Payment Tracking**: Track both outgoing payments (agent pays) and incoming payments (agent receives) with persistent storage. Automatic recording with policy enforcement
- **Payment Policies**: Control spending and receivables with per-payment limits, time-windowed totals, per-target/per-sender limits, and allow/block lists. Multiple policy groups for flexible control
- **Accept Payments**: Accept payments in USDC on Ethereum L2s (Base) or Solana with automatic paywall middleware. No payment infrastructure code needed
- **Payment Analytics**: Comprehensive payment reporting with summary statistics, transaction history, and CSV/JSON export for accounting system integration
- **Agent-to-Agent Communication**: Agents can discover and call other agents, enabling agent marketplaces and multi-agent systems where agents buy and sell services from each other
- **Onchain Identity**: Register agent identities onchain, build reputation, and prove ownership for trust in agent marketplaces
- **Framework Flexibility**: Write your agent logic once, deploy on Hono, TanStack Start, Express, or Next.js. Choose the framework that fits your stack
- **Type-Safe APIs**: Define inputs/outputs with Zod schemas, get automatic validation, JSON schemas, and full TypeScript inference
- **Real-Time Streaming**: Server-Sent Events (SSE) for streaming agent responses. Perfect for LLM outputs and long-running operations
- **Task Management**: Long-running tasks with status tracking, cancellation, and real-time updates via SSE subscriptions
- **Auto-Discovery**: Auto-generated AgentCard manifests with Open Graph tags. Agents are discoverable in directories and show rich previews when shared
- **Quick Start**: CLI scaffolding with templates for common patterns. Get a working agent in minutes, not hours
- **Multi-Network Support**: Accept payments on EVM (Base, Ethereum, Sepolia) or Solana (mainnet, devnet) networks
- **Composable Architecture**: Add only the features you need. Payments, identity, A2A, wallets, analytics. Mix and match as your agent evolves

Whether you're building paid AI services, agent marketplaces, or multi-agent systems where agents transact with each other, Lucid Agents provides the payments and commerce infrastructure you need.

---

## Quick Start (5 Minutes)

Get your first monetized AI agent running in minutes.

### Prerequisites

- [Bun](https://bun.sh/docs/installation) >= 1.0 (recommended) or Node.js >= 20.9
- An API key from your preferred LLM provider (OpenAI, Anthropic, etc.)
- Optional: A wallet address for receiving payments

### 1. Create and Configure Your Agent

```bash
# Interactive mode - CLI guides you through all options
bunx @lucid-agents/cli my-agent

# Or use inline configuration for faster setup
bunx @lucid-agents/cli my-agent \
  --adapter=hono \
  --template=axllm \
  --AGENT_NAME="My AI Agent" \
  --AGENT_DESCRIPTION="AI-powered assistant" \
  --OPENAI_API_KEY=your_api_key_here \
  --PAYMENTS_RECEIVABLE_ADDRESS=0xYourAddress \
  --NETWORK=ethereum \
  --DEFAULT_PRICE=1000
```

The CLI will:

- **Adapter selection**: `hono` (HTTP server), `tanstack-ui` (full dashboard), `tanstack-headless` (API only), `express` (Node.js server), or `next` (Next.js App Router)
- **Template selection**: `blank` (minimal), `axllm` (LLM-powered), `axllm-flow` (workflows), `identity` (onchain identity), `trading-data-agent` (merchant), or `trading-recommendation-agent` (shopper)
- **Configuration**: Set agent metadata, LLM keys, and optional payment details
- **Install dependencies**: Automatically run `bun install`

### 2. Start Your Agent

```bash
cd my-agent
bun run dev
```

Your agent is now running at `http://localhost:3000`!

**Try it out:**

```bash
# View agent manifest
curl http://localhost:3000/.well-known/agent.json

# List entrypoints
curl http://localhost:3000/entrypoints

# Invoke an entrypoint (example for echo template)
curl -X POST http://localhost:3000/entrypoints/echo/invoke \
  -H "Content-Type: application/json" \
  -d '{"input": {"text": "Hello, Lucid Agents!"}}'
```

---

## Architecture Overview

Lucid Agents is a TypeScript monorepo built for protocol-agnostic, multi-runtime agent deployment with a compositional extension architecture:

- **Layer 1: Core** - Protocol-agnostic agent runtime with extension system (`@lucid-agents/core`) - no protocol-specific code
- **Layer 2: Extensions** - Optional capabilities added via composition: `http()` (HTTP protocol), `payments()` (x402), `wallets()` (wallet management), `identity()` (ERC-8004), `a2a()` (agent-to-agent), `xmpt()` (message inbox + threading), `ap2()` (Agent Payments Protocol)
- **Layer 3: Adapters** - Framework integrations (hono, tanstack, express, next) that use the HTTP extension

The core runtime is completely protocol-agnostic. Protocols like HTTP are provided as extensions that get merged into the runtime. Future protocols (gRPC, WebSocket, etc.) can be added as additional extensions.

> For detailed architecture documentation including dependency graphs, request flows, and extension system design, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Packages

- **`@lucid-agents/types`** - Shared type definitions used across all packages
- **`@lucid-agents/core`** - Protocol-agnostic agent runtime with extension system
- **`@lucid-agents/http`** - HTTP extension for request/response handling, streaming, and SSE
- **`@lucid-agents/wallet`** - Wallet SDK for agent and developer wallet management
- **`@lucid-agents/payments`** - x402 payment utilities with bi-directional tracking, payment policies, and persistent storage (SQLite, In-Memory, Postgres)
- **`@lucid-agents/analytics`** - Payment analytics and reporting with CSV/JSON export for accounting system integration
- **`@lucid-agents/identity`** - ERC-8004 identity toolkit for onchain agent identity
- **`@lucid-agents/a2a`** - A2A Protocol client for agent-to-agent communication
- **`@lucid-agents/xmpt`** - XMPT messaging extension for inbox semantics, send/receive APIs, and thread-aware messaging
- **`@lucid-agents/ap2`** - AP2 (Agent Payments Protocol) extension for Agent Cards
- **`@lucid-agents/hono`** - Hono HTTP server adapter
- **`@lucid-agents/express`** - Express HTTP server adapter
- **`@lucid-agents/tanstack`** - TanStack Start adapter (UI and headless variants)
- **`@lucid-agents/cli`** - CLI scaffolding tool for creating new agent projects

### Key Concepts

**Entrypoints**: Typed API endpoints that define your agent's capabilities. Each entrypoint has:

- Input/output schemas (Zod)
- Optional pricing (x402)
- Handler (synchronous) or stream handler (SSE)

**Adapters**: Runtime frameworks that expose your entrypoints as HTTP routes. Choose based on your deployment needs:

- `hono` - Lightweight, edge-compatible HTTP server
- `tanstack` - Full-stack React with UI dashboard (or headless API-only)
- `express` - Traditional Node.js HTTP server
- `next` - Next.js App Router integration

**A2A Communication**: Agent-to-agent communication protocol enabling agents to call other agents:

- **Direct Invocation**: Synchronous calls via `client.invoke()` or `client.stream()`
- **Task-Based Operations**: Long-running tasks with `sendMessage()`, status tracking, and cancellation
- **Multi-Turn Conversations**: Group related tasks with `contextId` for conversational agents
- **Agent Composition**: Agents can act as both clients and servers, enabling complex supply chains

**Manifests**: Auto-generated AgentCard (`.well-known/agent-card.json`) that describes your agent's capabilities, pricing, and identity for discovery tools and A2A protocols. Built using immutable composition pattern.

**Payment Networks**: Accept payments on:

- **EVM**: Base, Ethereum, Sepolia (ERC-20 USDC)
- **Solana**: Mainnet, Devnet (SPL USDC)

**Identity**: ERC-8004 onchain identity for reputation and trust. Register once, reference across all networks.

**Payment Policies**: Control both outgoing and incoming payments with limits, time windows, and allow/block lists. Organize policies into groups for flexible control.

**Payment Analytics**: Track spending and earnings with summary statistics, transaction history, and export to CSV/JSON for accounting systems.

---

## Key Packages

### Core Packages

#### [`@lucid-agents/core`](packages/core/README.md)

Protocol-agnostic agent runtime with extension system.

```typescript
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { z } from 'zod';

const agent = await createAgent({
  name: 'my-agent',
  version: '1.0.0',
  description: 'My first agent',
})
  .use(http())
  .build();

agent.entrypoints.add({
  key: 'greet',
  input: z.object({ name: z.string() }),
  async handler({ input }) {
    return { output: { message: `Hello, ${input.name}!` } };
  },
});
```

#### [`@lucid-agents/hono`](packages/hono/README.md)

Hono adapter for building traditional HTTP servers.

```typescript
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { createAgentApp } from '@lucid-agents/hono';

const agent = await createAgent({
  name: 'my-agent',
  version: '1.0.0',
})
  .use(http())
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

// Add entrypoints...

// Export for Bun.serve or use Hono serve helper
export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
};
```

#### [`@lucid-agents/tanstack`](packages/tanstack/README.md)

TanStack Start adapter with UI and headless variants.

```typescript
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { createTanStackRuntime } from '@lucid-agents/tanstack';

const agent = await createAgent({
  name: 'my-agent',
  version: '1.0.0',
})
  .use(http())
  .build();

export const { runtime: tanStackRuntime, handlers } =
  await createTanStackRuntime(agent);
```

#### [`@lucid-agents/http`](packages/http/README.md)

HTTP extension for request/response handling, streaming, and Server-Sent Events.

```typescript
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';

const agent = await createAgent({
  name: 'my-agent',
  version: '1.0.0',
})
  .use(http({ landingPage: true }))
  .build();

// Access HTTP handlers via agent.handlers
```

#### [`@lucid-agents/identity`](packages/identity/README.md)

ERC-8004 toolkit for onchain identity, reputation, and validation.

```typescript
import { createAgent } from '@lucid-agents/core';
import { wallets } from '@lucid-agents/wallet';
import { walletsFromEnv } from '@lucid-agents/wallet';
import { createAgentIdentity } from '@lucid-agents/identity';

const agent = await createAgent({
  name: 'my-agent',
  version: '1.0.0',
})
  .use(wallets({ config: walletsFromEnv() }))
  .build();

const identity = await createAgentIdentity({
  runtime: agent,
  domain: 'my-agent.example.com',
  autoRegister: true, // Register onchain if not exists
});
```

#### [`@lucid-agents/payments`](packages/payments/README.md)

x402 payment utilities with bi-directional tracking, payment policies, and persistent storage.

```typescript
import { createAgent } from '@lucid-agents/core';
import { payments } from '@lucid-agents/payments';
import { paymentsFromEnv } from '@lucid-agents/payments';

const agent = await createAgent({
  name: 'my-agent',
  version: '1.0.0',
})
  .use(
    payments({
      config: {
        ...paymentsFromEnv(),
        policyGroups: [
          {
            name: 'Daily Limits',
            outgoingLimits: {
              global: { maxTotalUsd: 100.0, windowMs: 86400000 },
            },
            incomingLimits: {
              global: { maxTotalUsd: 5000.0, windowMs: 86400000 },
            },
            blockedSenders: {
              domains: ['https://untrusted.example.com'],
            },
          },
        ],
      },
      storage: { type: 'sqlite' }, // or 'in-memory' or 'postgres'
    })
  )
  .build();

// Auto-detects EVM vs Solana from PAYMENTS_RECEIVABLE_ADDRESS format
// Automatically tracks outgoing and incoming payments
```

#### [`@lucid-agents/a2a`](packages/a2a/README.md)

A2A Protocol client for agent-to-agent communication.

```typescript
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { a2a } from '@lucid-agents/a2a';

const agent = await createAgent({
  name: 'my-agent',
  version: '1.0.0',
})
  .use(http())
  .use(a2a())
  .build();

// Access A2A client via agent.a2a
const result = await agent.a2a.client.invoke(
  'https://other-agent.com',
  'skillId',
  {
    input: 'data',
  }
);
```

#### [`@lucid-agents/analytics`](packages/analytics/README.md)

Payment analytics and reporting with CSV/JSON export for accounting systems.

```typescript
import { createAgent } from '@lucid-agents/core';
import { analytics } from '@lucid-agents/analytics';
import { getSummary, exportToCSV } from '@lucid-agents/analytics';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';

const agent = await createAgent({
  name: 'my-agent',
  version: '1.0.0',
})
  .use(payments({ config: paymentsFromEnv() }))
  .use(analytics())
  .build();

// Get payment summary
const summary = await getSummary(agent.analytics.paymentTracker, 86400000);
console.log(
  `Outgoing: ${summary.outgoingTotal}, Incoming: ${summary.incomingTotal}`
);

// Export to CSV for accounting systems
const csv = await exportToCSV(agent.analytics.paymentTracker);
```

#### [`@lucid-agents/ap2`](packages/ap2/README.md)

AP2 (Agent Payments Protocol) extension for Agent Cards.

```typescript
import { createAgent } from '@lucid-agents/core';
import { ap2 } from '@lucid-agents/ap2';

const agent = await createAgent({
  name: 'my-agent',
  version: '1.0.0',
})
  .use(ap2({ roles: ['merchant'] }))
  .build();
```

#### [`@lucid-agents/wallet`](packages/wallet/README.md)

Wallet SDK for agent and developer wallet management.

```typescript
import { createAgentWallet } from '@lucid-agents/wallet';

const wallet = await createAgentWallet({
  type: 'local',
  privateKey: process.env.AGENT_WALLET_PRIVATE_KEY,
});

// Or use a thirdweb Engine wallet with the same connector interface
const agent = await createAgent({
  name: 'thirdweb-agent',
  version: '0.1.0',
})
  .use(http())
  .use(
    wallets({
      config: {
        agent: {
          type: 'thirdweb',
          secretKey: process.env.AGENT_WALLET_SECRET_KEY!,
          clientId: process.env.AGENT_WALLET_CLIENT_ID,
          walletLabel: 'agent-wallet',
          chainId: 84532, // Base Sepolia
        },
      },
    })
  )
  .build();

const connector = agent.wallets?.agent?.connector;
const capabilities = connector?.getCapabilities?.();
if (!connector?.getWalletClient || !capabilities?.walletClient) {
  throw new Error('thirdweb wallet client not available');
}

const walletClient = (await connector.getWalletClient())?.client;
if (!walletClient) {
  throw new Error('Wallet client not initialized');
}

await walletClient.writeContract({
  account: walletClient.account,
  chain: walletClient.chain,
  address: USDC_ADDRESS,
  abi: erc20Abi,
  functionName: 'transfer',
  args: ['0xEA4b0D5ebF46C22e4c7E6b6164706447e67B9B1D', 10_000n], // 0.01 USDC
});
```

### CLI Tool

#### [`@lucid-agents/cli`](packages/cli/README.md)

CLI for scaffolding new agent projects with templates and interactive configuration.

```bash
# Interactive mode
bunx @lucid-agents/cli

# With options
bunx @lucid-agents/cli my-agent \
  --adapter=tanstack-ui \
  --template=axllm \
  --non-interactive
```

Each package contains detailed API documentation, environment variable references, and working examples.

---

## Example: Full-Featured Agent

Here's a complete example showing identity, payments, and LLM integration with streaming:

```typescript
import { z } from 'zod';
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { wallets } from '@lucid-agents/wallet';
import { walletsFromEnv } from '@lucid-agents/wallet';
import { payments } from '@lucid-agents/payments';
import { paymentsFromEnv } from '@lucid-agents/payments';
import { identity, identityFromEnv } from '@lucid-agents/identity';
import { createAgentApp } from '@lucid-agents/hono';
import { AI } from '@ax-llm/ax';

// 1. Initialize LLM
const ai = new AI({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
});

// 2. Build app with all extensions (identity extension handles ERC-8004 registration automatically)
const agent = await createAgent({
  name: 'ai-assistant',
  version: '1.0.0',
  description: 'AI assistant with onchain identity and streaming responses',
  image: 'https://my-agent.example.com/og-image.png',
})
  .use(http())
  .use(wallets({ config: walletsFromEnv() }))
  .use(payments({ config: paymentsFromEnv() }))
  .use(identity({ config: identityFromEnv() }))
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

// 4. Add paid entrypoint with streaming
addEntrypoint({
  key: 'chat',
  description: 'Chat with AI assistant',
  input: z.object({
    message: z.string(),
    history: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string(),
        })
      )
      .optional(),
  }),
  streaming: true,
  async stream(ctx, emit) {
    const messages = [
      ...(ctx.input.history || []),
      { role: 'user' as const, content: ctx.input.message },
    ];

    const stream = await ai.chat.stream({ messages });

    for await (const chunk of stream) {
      await emit({
        kind: 'delta',
        delta: chunk.delta,
        mime: 'text/plain',
      });
    }

    return {
      output: { completed: true },
      usage: { total_tokens: stream.usage.total_tokens },
    };
  },
});

// Export for Bun.serve or use Hono serve helper
const port = Number(process.env.PORT ?? 3000);
export default {
  port,
  fetch: app.fetch,
};
```

**Features demonstrated:**

- Onchain identity registration (ERC-8004). Automatically handled by identity extension
- Automatic x402 payment verification
- Bi-directional payment tracking with policy enforcement
- Streaming LLM responses via SSE
- Type-safe input/output schemas
- Trust metadata in manifest for verifiable agent identity
- Open Graph tags for discovery

---

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/daydreamsai/lucid-agents.git
cd lucid-agents

# Install dependencies
bun install

# Build all packages
bun run build:packages
```

### Package Development

```bash
# Work on a specific package
cd packages/core

# Build this package
bun run build

# Run tests
bun test

# Type check
bun run type-check

# Lint and format
bun run lint:fix
bun run format
```

---

## Contributing

We welcome contributions! Whether you're fixing bugs, adding features, or improving documentation.

### Development Setup

1. **Fork and clone** the repository

2. **Install dependencies:**

   ```bash
   bun install
   ```

3. **Build all packages** (required - must run in dependency order):

   ```bash
   bun run build:packages
   ```

4. **Make your changes:**
   - Add tests for new features
   - Update documentation as needed

5. **Run checks before submitting:**

   ```bash
   bun test              # All tests
   bun run type-check    # TypeScript validation
   bun run lint          # Code linting
   ```

6. **Create a changeset:**

   ```bash
   bun run changeset
   ```

7. **Submit a pull request**

For detailed guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Resources

### Documentation

- **Architecture Guide**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - System design, dependency graphs, and request flows
- **Package READMEs**: Each package has comprehensive documentation and `AGENTS.md` files
- **Contributing Guide**: [CONTRIBUTING.md](CONTRIBUTING.md) - Development workflow and guidelines

### Protocols & Specifications

- **ERC-8004 Specification**: [EIP-8004](https://eips.ethereum.org/EIPS/eip-8004) - Onchain agent identity standard
- **x402 Protocol**: [x402 GitHub](https://github.com/paywithx402) - HTTP-native payment protocol
- **A2A Protocol**: [Agent-to-Agent Communication](https://a2a-protocol.org/) - Agent discovery and communication protocol

### Technologies

- **Hono Framework**: [hono.dev](https://hono.dev/) - Lightweight web framework
- **TanStack Start**: [tanstack.com/start](https://tanstack.com/start) - Full-stack React framework
- **Bun Runtime**: [bun.sh](https://bun.sh/) - Fast JavaScript runtime
- **Zod**: [zod.dev](https://zod.dev/) - TypeScript-first schema validation

---

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

## Contributors

<a href="https://github.com/daydreamsai/lucid-agents/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=daydreamsai/lucid-agents" alt="Contributors" />
</a>

---

## Star History

<a href="https://star-history.com/#daydreamsai/lucid-agents&Date">
  <img src="https://api.star-history.com/svg?repos=daydreamsai/lucid-agents&type=Date" alt="Star History Chart" />
</a>

---

<div align="center">
  <p>Built with ❤️ by the Daydreams AI team</p>
  <p>
    <a href="https://github.com/daydreamsai/lucid-agents">GitHub</a> •
    <a href="https://www.npmjs.com/org/lucid-agents">npm</a> •
    <a href="https://twitter.com/daydreamsai">Twitter</a>
  </p>
</div>
