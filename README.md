<div align="center">
  <h1>Lucid Agents</h1>
  <p><strong>The Multi-Runtime Framework for Building and Monetizing AI Agents</strong></p>
  <p>Build, deploy, and monetize autonomous AI agents with typed entrypoints, on-chain identity, and built-in payment infrastructure.</p>
</div>

<div align="center">
  <a href="https://github.com/daydreamsai/lucid-agents/blob/master/LICENSE"><img src="https://img.shields.io/github/license/daydreamsai/lucid-agents?style=for-the-badge" alt="License"></a>
  <a href="https://www.npmjs.com/package/@lucid-agents/cli"><img src="https://img.shields.io/npm/v/@lucid-agents/cli?style=for-the-badge" alt="NPM Version"></a>
  <a href="https://github.com/daydreamsai/lucid-agents/actions"><img src="https://img.shields.io/github/actions/workflow/status/daydreamsai/lucid-agents/ci.yml?branch=master&style=for-the-badge" alt="CI Status"></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/runtime-bun-black?style=for-the-badge&logo=bun" alt="Bun"></a>
</div>

---

## What is Lucid Agents?

Lucid Agents is a TypeScript-first framework for building production-ready AI agents with:

- **Multi-runtime support**: Deploy the same agent logic across Hono, TanStack Start, or Next.js
- **Built-in monetization**: x402 payment protocol with support for Ethereum (EVM) and Solana networks
- **On-chain identity**: ERC-8004 integration for agent reputation, validation, and trust
- **Type-safe APIs**: Zod-powered schemas with automatic manifest generation
- **Developer experience**: CLI scaffolding, hot reload, and comprehensive examples

Whether you're building a simple chatbot, a complex multi-agent system, or a marketplace of paid AI services, Lucid Agents provides the infrastructure you need.

---

## Key Features

- **Multi-Adapter Architecture**: Write your agent logic once, deploy on Hono, TanStack Start, or Next.js
- **x402 Payment Protocol**: Accept payments in USDC on Ethereum L2s (Base) or Solana with automatic paywall middleware
- **ERC-8004 Identity Layer**: Register agent identities on-chain, build reputation, and prove ownership
- **Type-Safe Entrypoints**: Define inputs/outputs with Zod schemas, get automatic validation and JSON schemas
- **Streaming Support**: Server-Sent Events (SSE) for real-time agent responses
- **AgentCard Manifests**: Auto-generated A2A-compatible manifests with Open Graph tags for discoverability
- **Template System**: Scaffold new agents with `blank`, `axllm`, `axllm-flow`, or `identity` templates
- **Multi-Network Support**: EVM (Base, Ethereum, Sepolia) and Solana (mainnet, devnet) payment networks
- **Production-Ready**: Built with TypeScript strict mode, ESM modules, and comprehensive testing

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
bunx @lucid-agents/create-agent-kit my-agent

# Or use inline configuration for faster setup
bunx @lucid-agents/create-agent-kit my-agent \
  --adapter=hono \
  --template=axllm \
  --AGENT_NAME="My AI Agent" \
  --AGENT_DESCRIPTION="AI-powered assistant" \
  --OPENAI_API_KEY=your_api_key_here \
  --PAYMENTS_RECEIVABLE_ADDRESS=0xYourAddress \
  --NETWORK=base-sepolia \
  --DEFAULT_PRICE=1000
```

The CLI will:

- **Adapter selection**: `hono` (HTTP server), `tanstack-ui` (full dashboard), or `tanstack-headless` (API only)
- **Template selection**: `blank` (minimal), `axllm` (LLM-powered), `axllm-flow` (workflows), or `identity` (on-chain identity)
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

Lucid Agents is a TypeScript monorepo built for multi-runtime agent deployment.

> For detailed architecture documentation including dependency graphs, request flows, and extension system design, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Your Agent                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Entrypoints (typed with Zod)                          │ │
│  │  ├─ invoke handlers (request → response)               │ │
│  │  └─ stream handlers (request → SSE stream)             │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼─────┐    ┌──────▼──────┐   ┌─────▼──────┐
    │   Hono   │    │  TanStack   │   │  Next.js   │
    │  Adapter │    │   Adapter   │   │  Adapter   │
    └────┬─────┘    └──────┬──────┘   └─────┬──────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │
         ┌─────────────────┴─────────────────┐
         │                                   │
    ┌────▼──────────┐              ┌────────▼────────┐
    │  agent-kit    │              │  agent-kit-     │
    │  (core)       │◄─────────────┤  identity       │
    │               │              │  (ERC-8004)     │
    └───────────────┘              └─────────────────┘
```

### Package Structure

```
/
├── packages/
│   ├── agent-kit/              # Core runtime and types
│   │   ├── src/core/           # Agent runtime, manifest generation
│   │   ├── src/http/           # HTTP utilities
│   │   └── src/axllm/          # LLM integration helpers
│   │
│   ├── agent-kit-hono/         # Hono HTTP server adapter
│   │   ├── src/app.ts          # createAgentApp() for Hono
│   │   └── src/paywall.ts      # x402 payment middleware
│   │
│   ├── agent-kit-tanstack/     # TanStack Start adapter
│   │   ├── src/runtime.ts      # createTanStackRuntime()
│   │   └── src/paywall.ts      # TanStack payment middleware
│   │
│   ├── agent-kit-identity/     # ERC-8004 identity toolkit
│   │   ├── src/init.ts         # createAgentIdentity()
│   │   ├── src/registries/     # Identity/Reputation/Validation clients
│   │   └── src/utils/          # Signature helpers, CAIP-10
│   │
│   ├── agent-kit-payments/     # x402 payment utilities
│   │   ├── src/payments.ts     # Multi-network payment config
│   │   └── src/x402.ts         # x402 protocol helpers
│   │
│   └── create-agent-kit/       # CLI scaffolding tool
│       ├── src/index.ts        # Interactive CLI
│       ├── adapters/           # Runtime frameworks (hono, tanstack, next)
│       └── templates/          # Project templates (blank, axllm, identity)
```

### Key Concepts

**Entrypoints**: Typed API endpoints that define your agent's capabilities. Each entrypoint has:

- Input/output schemas (Zod)
- Optional pricing (x402)
- Handler (synchronous) or stream handler (SSE)

**Adapters**: Runtime frameworks that expose your entrypoints as HTTP routes. Choose based on your deployment needs:

- `hono` - Lightweight, edge-compatible
- `tanstack` - Full-stack React with UI dashboard
- `next` - Next.js App Router integration

**Manifests**: Auto-generated AgentCard (`.well-known/agent.json`) that describes your agent's capabilities, pricing, and identity for discovery tools and A2A protocols.

**Payment Networks**: Accept payments on:

- **EVM**: Base, Ethereum, Sepolia (ERC-20 USDC)
- **Solana**: Mainnet, Devnet (SPL USDC)

**Identity**: ERC-8004 on-chain identity for reputation and trust. Register once, reference across all networks.

---

## Key Packages

### Core Packages

#### [`@lucid-agents/core`](packages/core/README.md)

Core agent runtime with entrypoints, manifests, and streaming support.

```typescript
import { createRuntime } from '@lucid-agents/core';
import { z } from 'zod';

const runtime = createRuntime({
  name: 'my-agent',
  version: '1.0.0',
  description: 'My first agent',
});

runtime.addEntrypoint({
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
import { createAgentApp } from '@lucid-agents/hono';

const { app, addEntrypoint } = createAgentApp({
  name: 'my-agent',
  version: '1.0.0',
});

// Add entrypoints...

export default app; // Bun.serve or Hono serve
```

#### [`@lucid-agents/tanstack`](packages/tanstack/README.md)

TanStack Start adapter with UI and headless variants.

```typescript
import { createTanStackRuntime } from '@lucid-agents/tanstack';

export const { runtime, handlers } = createTanStackRuntime({
  name: 'my-agent',
  version: '1.0.0',
});
```

#### [`@lucid-agents/identity`](packages/identity/README.md)

ERC-8004 toolkit for on-chain identity, reputation, and validation.

```typescript
import { createAgentIdentity } from '@lucid-agents/identity';

const identity = await createAgentIdentity({
  domain: 'my-agent.example.com',
  autoRegister: true, // Register on-chain if not exists
});
```

#### [`@lucid-agents/payments`](packages/payments/README.md)

x402 payment utilities for multi-network payment handling.

```typescript
import { paymentsFromEnv } from '@lucid-agents/payments';

const payments = paymentsFromEnv();
// Auto-detects EVM vs Solana from PAYMENTS_RECEIVABLE_ADDRESS format
```

### CLI Tool

#### [`@lucid-agents/create-agent-kit`](packages/cli/README.md)

CLI for scaffolding new agent projects with templates and interactive configuration.

```bash
# Interactive mode
bunx @lucid-agents/create-agent-kit

# With options
bunx @lucid-agents/create-agent-kit my-agent \
  --adapter=tanstack-ui \
  --template=axllm \
  --non-interactive
```

Each package contains detailed API documentation, environment variable references, and working examples.

---

## Example: Full-Featured Agent

Here's a complete example showing identity, payments, and LLM integration:

```typescript
import { z } from 'zod';
import { createAgentApp } from '@lucid-agents/hono';
import {
  createAgentIdentity,
  getTrustConfig,
} from '@lucid-agents/identity';
import { AI } from '@ax-llm/ax';

// 1. Create on-chain identity
const identity = await createAgentIdentity({
  domain: 'my-agent.example.com',
  autoRegister: true,
});

// 2. Initialize LLM
const ai = new AI({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
});

// 3. Create agent with payments and identity
const { app, addEntrypoint } = createAgentApp(
  {
    name: 'ai-assistant',
    version: '1.0.0',
    description: 'AI assistant with on-chain reputation',
    image: 'https://my-agent.example.com/og-image.png',
  },
  {
    config: {
      payments: {
        payTo: process.env.PAYMENTS_RECEIVABLE_ADDRESS!,
        network: 'base-sepolia',
        facilitatorUrl: 'https://facilitator.daydreams.systems',
        defaultPrice: '5000', // 0.005 USDC per request
      },
    },
    useConfigPayments: true,
    trust: getTrustConfig(identity),
  }
);

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

export default app;
```

**Features demonstrated:**

- On-chain identity registration (ERC-8004)
- Automatic x402 payment verification
- Streaming LLM responses via SSE
- Type-safe input/output schemas
- Trust metadata in manifest
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
cd packages/agent-kit

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

- **ERC-8004 Specification**: [EIP-8004](https://eips.ethereum.org/EIPS/eip-8004) - On-chain agent identity standard
- **x402 Protocol**: [x402 GitHub](https://github.com/paywithx402) - HTTP-native payment protocol
- **A2A Protocol**: [Agent-to-Agent Communication](https://agents.md/) - Agent discovery and communication

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
