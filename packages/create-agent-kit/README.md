# @lucid-agents/create-agent-kit

CLI scaffolding tool to quickly generate new agent projects with templates, environment setup, and optional dependency installation.

## Overview

`create-agent-kit` is an interactive CLI that generates a fully-configured agent project based on `@lucid-agents/agent-kit`. It handles project setup, template selection, environment configuration, and optional dependency installation so you can start building immediately.

## Quick Start

Create a new agent project interactively:

```bash
bunx @lucid-agents/create-agent-kit@latest
```

Or with a specific project name:

```bash
bunx @lucid-agents/create-agent-kit@latest my-agent
```

## Usage

### Interactive Mode (Recommended)

Run without arguments for an interactive setup:

```bash
bunx @lucid-agents/create-agent-kit@latest
```

The CLI will guide you through:
1. **Project name** - Directory name for your agent
2. **Template selection** - Choose from available templates
3. **Configuration** - Set up agent metadata, entrypoints, and optional payments
4. **Environment** - Generate `.env` file with your settings
5. **Installation** - Optionally install dependencies with `bun install`

### Non-Interactive Mode

Specify options via flags for automated setup:

```bash
bunx @lucid-agents/create-agent-kit@latest my-agent \
  --template blank \
  --install \
  --env
```

## CLI Options

### `<app-name>`

Project directory name (positional argument). If omitted, you'll be prompted to provide one.

```bash
bunx @lucid-agents/create-agent-kit@latest my-agent
```

### `--template, -t <name>`

Select a specific template without prompting.

```bash
bunx @lucid-agents/create-agent-kit@latest --template axllm
```

Available templates:
- `blank` - Minimal agent with a single entrypoint
- `axllm` - Agent with AI/LLM integration using @ax-llm/ax
- `axllm-flow` - Agent with AxFlow for complex AI workflows

### `--install, -i`

Automatically run `bun install` after scaffolding.

```bash
bunx @lucid-agents/create-agent-kit@latest --install
```

### `--no-install`

Skip dependency installation (default behavior).

### `--env[=MODE]`

Control `.env` file generation:

- `prompt` (default) - Ask whether to create `.env` file
- `yes` or `auto` - Automatically create `.env` from `.env.example`
- `no` or `skip` - Skip `.env` generation

```bash
bunx @lucid-agents/create-agent-kit@latest --env=yes
```

### `--no-env`

Alias for `--env=no`. Skips `.env` file generation.

### `--help, -h`

Display help information.

```bash
bunx @lucid-agents/create-agent-kit@latest --help
```

## Templates

### Blank Template

**Template ID:** `blank`

Minimal agent with a single echo entrypoint. Best for starting from scratch or understanding the basics.

**Includes:**
- Basic agent configuration
- Single echo entrypoint
- TypeScript setup
- Example environment variables

**Use when:**
- Learning agent-kit fundamentals
- Building a custom agent from the ground up
- Need minimal boilerplate

### AxLLM Template

**Template ID:** `axllm`

Agent with AI/LLM integration using `@ax-llm/ax`.

**Includes:**
- LLM client configuration
- AI-powered entrypoints
- Environment setup for OpenAI/other providers
- Example prompts and completions

**Use when:**
- Building agents that need AI capabilities
- Integrating with LLM providers like OpenAI
- Creating conversational agents

### AxLLM Flow Template

**Template ID:** `axllm-flow`

Agent with advanced AI workflows using AxFlow for complex multi-step AI operations.

**Includes:**
- AxFlow configuration
- Complex workflow examples
- Multi-step AI orchestration
- Advanced prompt engineering patterns

**Use when:**
- Building sophisticated AI agents
- Need multi-step reasoning or workflows
- Orchestrating multiple LLM calls

## Project Structure

After scaffolding, your project will have:

```
my-agent/
├── src/
│   ├── agent.ts      # Agent configuration and entrypoints
│   └── index.ts      # Server entry point
├── .env.example      # Environment variable template
├── .env              # Your environment (if generated)
├── package.json      # Dependencies and scripts
├── tsconfig.json     # TypeScript configuration
└── README.md         # Project-specific documentation
```

### Key Files

**`src/agent.ts`**
- Defines your agent's metadata (name, version, description)
- Registers entrypoints with handlers
- Configures payments, AP2, and trust metadata (optional)

**`src/index.ts`**
- Boots a Bun HTTP server
- Serves the agent app
- Can be customized for different runtimes

**`.env.example`**
- Template showing required environment variables
- Safe to commit to version control

**`.env`**
- Your actual environment values
- Never commit this file

## Available Scripts

Generated projects include these npm scripts:

```bash
# Start agent in development mode (watch for changes)
bun run dev

# Start agent in production mode
bun run start

# Run agent module directly
bun run agent

# Type-check the project
bunx tsc --noEmit
```

## Next Steps

After creating your project:

1. **Review the generated code** - Check `src/agent.ts` to understand the structure
2. **Configure environment** - Edit `.env` with your settings
3. **Add entrypoints** - Define new capabilities in `src/agent.ts`
4. **Test locally** - Run `bun run dev` and visit http://localhost:3000
5. **Integrate identity** - Use `@lucid-agents/agent-kit-identity` for on-chain identity
6. **Deploy** - Deploy to your preferred Bun-compatible platform

## Environment Variables

Common environment variables used across templates:

### Basic Configuration

```bash
# Port for the HTTP server
PORT=3000
```

### Payments (Optional)

```bash
# x402 facilitator endpoint
FACILITATOR_URL=https://facilitator.daydreams.systems

# Payment recipient address
ADDRESS=0xYourAddressHere

# Network for payments (e.g., base-sepolia, base)
NETWORK=base-sepolia

# Default price in base units
DEFAULT_PRICE=1000
```

### LLM Configuration (AxLLM templates)

```bash
# OpenAI API key
OPENAI_API_KEY=sk-...

# Model selection
AX_MODEL=gpt-4o
AX_PROVIDER=openai

# Optional: Temperature, max tokens, etc.
AX_TEMPERATURE=0.7
```

### ERC-8004 Identity (Optional)

```bash
# Your agent's domain
AGENT_DOMAIN=my-agent.example.com

# Blockchain connection
RPC_URL=https://sepolia.base.org
CHAIN_ID=84532

# Wallet private key for registration
PRIVATE_KEY=0xYourPrivateKeyHere

# Auto-register on startup
REGISTER_IDENTITY=true
```

## Examples

### Create a blank agent

```bash
bunx @lucid-agents/create-agent-kit@latest my-basic-agent \
  --template blank \
  --install \
  --env=yes
```

### Create an AI-powered agent

```bash
bunx @lucid-agents/create-agent-kit@latest my-ai-agent \
  --template axllm \
  --install
```

### Create agent in current directory

```bash
bunx @lucid-agents/create-agent-kit@latest . \
  --template blank
```

## Package Information

- **Package**: `@lucid-agents/create-agent-kit`
- **License**: MIT
- **Repository**: [lucid-agents](https://github.com/lucid-dreams-ai/lucid-agents)

## Related Packages

- [`@lucid-agents/agent-kit`](../agent-kit/README.md) - Core agent runtime and HTTP server
- [`@lucid-agents/agent-kit-identity`](../agent-kit-identity/README.md) - ERC-8004 identity and trust management

## Troubleshooting

### "Template not found"

Ensure you're using a valid template ID: `blank`, `axllm`, or `axllm-flow`.

### "Target directory already exists"

The specified directory must be empty. Choose a different name or remove existing files.

### "bun install failed"

If auto-install fails, manually run `bun install` in your project directory.

### "Command not found: bunx"

Install Bun from [bun.sh](https://bun.sh) or use `npx` instead:

```bash
npx @lucid-agents/create-agent-kit@latest
```

## Contributing

See the main repository's [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

