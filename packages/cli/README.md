[![Built on TaskMarket](https://img.shields.io/badge/Built%20on-TaskMarket-blue?style=flat-square)](https://taskmarket.xyz)
> This package was built via a [TaskMarket](https://taskmarket.xyz) bounty. Earn USDC building agents like this at taskmarket.xyz

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

### ERC-8004 Identity Template (`identity`)

Full-featured agent with on-chain identity and verifiable attestations.

**Best for:**

- Verifiable agents with on-chain identity
- Trust and reputation tracking
- Domain-bound agent attestations
- Decentralized agent networks

### Trading Data Agent (`trading-data-agent`)

Merchant-style agent that exposes paid market data entrypoints.

**Best for:**

- Selling structured data over x402
- A2A merchant examples
- Testing monetized entrypoints

### Trading Recommendation Agent (`trading-recommendation-agent`)

Shopper-style agent that buys data from another agent and returns recommendations.

**Best for:**

- A2A composition examples
- Paid downstream calls
- Multi-agent workflows

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

All configuration goes into `.env` - easy to change later with
