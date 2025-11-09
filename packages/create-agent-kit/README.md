# @lucid-agents/create-agent-kit

CLI scaffolding tool to quickly generate new agent projects with built-in templates and interactive configuration.

## Quick Start

Create a new agent in seconds:

```bash
bunx @lucid-agents/create-agent-kit@latest my-agent
```

The wizard will guide you through template selection and configuration. That's it!

## Available Templates

Choose the template that fits your use case:

### Blank Template (`blank`)

Minimal agent with echo entrypoint. Best starting point for custom agents.

**Best for:**

- Learning agent-kit fundamentals
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

### Adapter Layers & Headless Mode

Framework-specific assets live under `packages/create-agent-kit/adapters/<adapter>`.  
When a template selects an adapter the CLI copies:

1. The template’s own files (agent logic, README, tests, etc.)
2. The adapter layer (UI, router, build config, etc.)
3. Optional template overrides in `templates/<id>/adapters/<adapter>`

For example, the TanStack adapter ships two variants:

- `--adapter=tanstack` (default) – copies the full UI shell from `adapters/tanstack/ui`
- `--adapter=tanstack --adapter-ui=headless` – copies the API-only variant from `adapters/tanstack/headless`

This keeps the runtime skeleton in one place while templates focus on agent behaviour.

## CLI Options

```bash
bunx @lucid-agents/create-agent-kit <app-name> [options]

Options:
  -t, --template <id>   Select template (blank, axllm, axllm-flow, identity)
  -a, --adapter <id>    Select runtime adapter/framework (hono, tanstack, etc.)
      --adapter-ui <mode>  Adapter-specific mode (e.g. headless for TanStack)
  -i, --install         Run bun install after scaffolding
  --no-install          Skip bun install (default)
  --wizard=no           Skip wizard, use template defaults
  --non-interactive     Same as --wizard=no
  --KEY=value           Pass template argument (use with --non-interactive)
  -h, --help            Show this help
```

### Examples

```bash
# Interactive setup (recommended)
bunx @lucid-agents/create-agent-kit@latest my-agent

# With specific template
bunx @lucid-agents/create-agent-kit@latest my-agent --template=identity

# Force a specific framework/runtime
bunx @lucid-agents/create-agent-kit@latest my-agent --adapter=tanstack --template=blank

# Headless TanStack runtime (API only)
bunx @lucid-agents/create-agent-kit@latest my-agent \
  --adapter=tanstack \
  --adapter-ui=headless \
  --template=blank

# Auto-install dependencies
bunx @lucid-agents/create-agent-kit@latest my-agent --install

# Non-interactive with defaults
bunx @lucid-agents/create-agent-kit@latest my-agent --template=blank --wizard=no
```

### Non-Interactive Mode with Template Arguments

Perfect for CI/CD, automation, or AI coding agents:

```bash
# Blank template with custom configuration
bunx @lucid-agents/create-agent-kit@latest my-agent \
  --template=blank \
  --non-interactive \
  --AGENT_DESCRIPTION="Custom agent for automation" \
  --AGENT_VERSION="1.0.0" \
  --PAYMENTS_RECEIVABLE_ADDRESS="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"

# Identity template with full configuration
bunx @lucid-agents/create-agent-kit@latest verified-agent \
  --template=identity \
  --non-interactive \
  --install \
  --AGENT_DESCRIPTION="Verifiable agent with on-chain identity" \
  --AGENT_VERSION="0.1.0" \
  --AGENT_DOMAIN="agent.example.com" \
  --PAYMENTS_FACILITATOR_URL="https://facilitator.daydreams.systems" \
  --PAYMENTS_NETWORK="base-sepolia" \
  --PAYMENTS_RECEIVABLE_ADDRESS="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0" \
  --PAYMENTS_DEFAULT_PRICE="1000" \
  --RPC_URL="https://sepolia.base.org" \
  --CHAIN_ID="84532" \
  --IDENTITY_AUTO_REGISTER="true"

# AxLLM template
bunx @lucid-agents/create-agent-kit@latest ai-agent \
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
PAYMENTS_NETWORK=base-sepolia
PAYMENTS_DEFAULT_PRICE=1000

# Wallet for transactions
PRIVATE_KEY=
```

### Identity Template

Additional variables for ERC-8004:

```bash
AGENT_DOMAIN=agent.example.com
IDENTITY_AUTO_REGISTER=true
RPC_URL=https://sepolia.base.org
CHAIN_ID=84532
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

- [`@lucid-agents/agent-kit`](../agent-kit/README.md) - Core agent runtime
- [`@lucid-agents/agent-kit-identity`](../agent-kit-identity/README.md) - ERC-8004 identity

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.
