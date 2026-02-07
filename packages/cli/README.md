# @lucid-agents/cli

CLI scaffolding tool to quickly generate new agent projects with built-in templates and interactive configuration.

## Quick Start

Create a new agent in seconds:

```bash
bunx @lucid-agents/cli@latest my-agent
```

The wizard will guide you through template selection and configuration. That's it!

## Available Templates

Choose the template that fits your use case:

### Blank Template (`blank`)

Minimal agent with echo entrypoint. Best starting point for custom agents.

**Best for:**

- Learning core fundamentals
- Building custom agents from scratch
- Minimal boilerplate

### AxLLM Template (`axllm`)

Agent with AI/LLM integration using `@ax-llm/ax`.

**Best for:**

- AI-powered agents
- LLM integration (OpenAI, etc.)
- Conversational interfaces

### AxLLM Flow Template (`axllm-flow`)

Agent with AxFlow for multi-step AI workflows.

**Best for:**

- Complex AI workflows
- Multi-step reasoning
- Orchestrating multiple LLM calls

### ERC-8004 Identity Template (`identity`)

Full-featured agent with on-chain identity and verifiable attestations.

**Best for:**

- Verifiable agents with on-chain identity
- Trust and reputation tracking
- Domain-bound agent attestations
- Decentralized agent networks

## How It Works

When you run the CLI:

1. **Choose your template** - Select which type of agent to create
2. **Configure through wizard** - Answer questions about your agent:
   - Agent name, version, description
   - Payment settings (receivable address, network, pricing)
   - Template-specific settings (domain for identity, etc.)
3. **Project generated** - Complete agent project with:
   - Configured `src/agent.ts`
   - Generated `.env` with your answers
   - Ready-to-use `package.json`
   - Template-specific features
4. **Install & run** - Optionally install dependencies with `--install`

All configuration goes into `.env` - easy to change later without editing code.

### Adapter System

Framework-specific assets live under `packages/cli/adapters/<adapter>`.
When you select an adapter, the CLI copies the corresponding runtime framework files:

**Available Adapters:**

- `hono` - Traditional HTTP server with Hono framework
- `express` - Node-style HTTP server built on Express with `@lucid-agents/agent-kit-express`
- `tanstack-ui` - TanStack Start with full UI dashboard (wallet integration, entrypoint testing, schema forms)
- `tanstack-headless` - TanStack Start API-only (no UI components)
- `next` – Next.js App Router shell with x402-next middleware and the dashboard UI

The adapter provides the runtime skeleton (routing, server setup, build config), while templates provide the agent logic (entrypoints, features, configuration).

## CLI Options

```bash
bunx @lucid-agents/cli <app-name> [options]

Options:
  -t, --template <id>   Select template (blank, axllm, axllm-flow, identity)
  -a, --adapter <id>    Select runtime adapter (hono, express, tanstack-ui, tanstack-headless, next)
  -i, --install         Run bun install after scaffolding
  --no-install          Skip bun install (default)
  --wizard=no           Skip wizard, use template defaults
  --non-interactive     Same as --wizard=no
  --network=<network>   Set payment network (base-sepolia, base, solana-devnet, solana)
  --KEY=value           Pass template argument (use with --non-interactive)
  -h, --help            Show this help
```

### Examples

```bash
# Interactive setup (recommended)
bunx @lucid-agents/cli@latest my-agent

# With specific template
bunx @lucid-agents/cli@latest my-agent --template=identity

# With Solana payment network
bunx @lucid-agents/cli@latest my-agent --network=solana-devnet

# With Base mainnet
bunx @lucid-agents/cli@latest my-agent --network=base

# Identity template with Solana payments
bunx @lucid-agents/cli@latest my-agent --template=identity --network=solana

# With Express adapter
bunx @lucid-agents/cli@latest my-agent --adapter=express --template=blank

# With Hono adapter
bunx @lucid-agents/cli@latest my-agent --adapter=hono --template=blank

# With TanStack UI (full dashboard)
bunx @lucid-agents/cli@latest my-agent --adapter=tanstack-ui --template=blank

# With TanStack headless (API only, no UI)
bunx @lucid-agents/cli@latest my-agent --adapter=tanstack-headless --template=blank

# Auto-install dependencies
bunx @lucid-agents/cli@latest my-agent --install

# Non-interactive with defaults
bunx @lucid-agents/cli@latest my-agent --template=blank --wizard=no
```

### Network Selection

All templates support both EVM and Solana payment networks:

**Interactive Mode:**
When you run the CLI interactively, you'll see a dropdown menu to select your payment network:

```
? Payment network
  ❯ Base Sepolia (EVM testnet)
    Base (EVM mainnet)
    Solana Devnet
    Solana Mainnet
```

**Non-Interactive Mode:**
Use the `--network` flag to specify the network:

```bash
# Solana devnet
bunx @lucid-agents/cli my-agent --network=solana-devnet --non-interactive

# Base mainnet
bunx @lucid-agents/cli my-agent --network=base --non-interactive
```

**Important Notes:**

- Payment network is independent of identity registration (identity uses EVM chain)
- For identity template: EVM private key is for identity registration, payment address can be Solana
- Payment address can be shared across multiple agents

```

### Non-Interactive Mode with Template Arguments

Perfect for CI/CD, automation, or AI coding agents:

```bash
# Blank template with custom configuration
bunx @lucid-agents/cli@latest my-agent \
  --template=blank \
  --non-interactive \
  --AGENT_DESCRIPTION="Custom agent for automation" \
  --AGENT_VERSION="1.0.0" \
  --PAYMENTS_RECEIVABLE_ADDRESS="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"

# Identity template with full configuration
bunx @lucid-agents/cli@latest verified-agent \
  --template=identity \
  --non-interactive \
  --install \
  --AGENT_DESCRIPTION="Verifiable agent with on-chain identity" \
  --AGENT_VERSION="0.1.0" \
  --AGENT_DOMAIN="agent.example.com" \
  --PAYMENTS_FACILITATOR_URL="https://facilitator.daydreams.systems" \
  --PAYMENTS_NETWORK="ethereum" \
  --PAYMENTS_RECEIVABLE_ADDRESS="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0" \
  --PAYMENTS_DEFAULT_PRICE="0.1" \
  --RPC_URL="https://eth.llamarpc.com" \
  --CHAIN_ID="1" \
  --IDENTITY_AUTO_REGISTER="true"

# AxLLM template
bunx @lucid-agents/cli@latest ai-agent \
  --template=axllm \
  --non-interactive \
  --AGENT_DESCRIPTION="AI-powered agent" \
  --PAYMENTS_RECEIVABLE_ADDRESS="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"
```

**How it works:**

1. Any flag matching a wizard prompt key (e.g., `--AGENT_DESCRIPTION`) is captured
2. In non-interactive mode, these values override template defaults
3. Values not provided fall back to `defaultValue` from `template.json`
4. Check `template.schema.json` in each template for available arguments

## Environment Variables

The wizard writes all configuration to `.env`. You can edit these values anytime.

### Common Variables (All Templates)

```bash
# Agent metadata
AGENT_NAME=my-agent
AGENT_VERSION=0.1.0
AGENT_DESCRIPTION=Your agent description

# Payments
PAYMENTS_FACILITATOR_URL=https://facilitator.daydreams.systems
PAYMENTS_RECEIVABLE_ADDRESS=0xYourWalletAddress
PAYMENTS_NETWORK=ethereum
PAYMENTS_DEFAULT_PRICE=0.1

# Wallet for transactions
PRIVATE_KEY=
```

### Identity Template

Additional variables for ERC-8004:

```bash
AGENT_DOMAIN=agent.example.com
IDENTITY_AUTO_REGISTER=true
RPC_URL=https://eth.llamarpc.com
CHAIN_ID=1
```

### AxLLM Templates

Additional variables for LLM:

```bash
OPENAI_API_KEY=sk-...
AX_MODEL=gpt-4o
AX_PROVIDER=openai
```

## Project Structure

Generated projects have:

```
my-agent/
├── src/
│   ├── agent.ts      # Agent configuration and entrypoints
│   └── index.ts      # HTTP server
├── .env              # Your configuration (from wizard)
├── .env.example      # Documentation reference
├── package.json      # Dependencies and scripts
├── tsconfig.json     # TypeScript config
└── README.md         # Project documentation
```

### Key Files Explained

**`src/agent.ts`**

- Defines your agent's metadata (name, version, description)
- Registers entrypoints with handlers
- Configures payments (x402), AP2, and trust metadata (optional)

**`src/index.ts`**

- Boots a Bun HTTP server
- Serves the agent app
- Can be customized for different runtimes

**`.env.example`**

- Template showing required environment variables
- Safe to commit to version control
- Reference documentation for configuration

**`.env`**

- Your actual environment values (from wizard)
- Never commit this file (contains secrets like PRIVATE_KEY)
- Edit anytime to change configuration

## Next Steps

After creating your project:

1. **Install dependencies** - `bun install` (or use `--install` flag)
2. **Start the agent** - `bun run dev` (visit http://localhost:3000)
3. **Customize** - Edit `src/agent.ts` to add your capabilities
4. **Deploy** - Deploy to your Bun-compatible platform

## Available Scripts

Generated projects include:

```bash
bun run dev      # Start in watch mode (auto-reload)
bun run start    # Start in production mode
bun run agent    # Run agent module directly
bunx tsc --noEmit # Type-check
```

## Troubleshooting

### Template not found

Use a valid template ID: `blank`, `axllm`, `axllm-flow`, or `identity`.

### Directory already exists

The target directory must be empty. Choose a different name.

### Install failed

Run `bun install` manually in your project directory.

### Command not found: bunx

Install Bun from [bun.sh](https://bun.sh).

Note: While the CLI works with Node/npx, generated projects require Bun.

## Related Packages

- [`@lucid-agents/core`](../core/README.md) - Core agent runtime
- [`@lucid-agents/identity`](../identity/README.md) - ERC-8004 identity

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.
