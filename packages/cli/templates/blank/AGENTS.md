# Blank Agent Template - AI Coding Guide

This guide helps AI coding agents understand and extend this agent project.

## Project Overview

This is a minimal Bun HTTP agent built with `@lucid-agents/core`. It provides a simple starting point with basic entrypoint configuration and optional payment support.

**Key Files:**

- `src/agent.ts` - Agent definition and entrypoints
- `src/index.ts` - Bun HTTP server setup
- `.env` - Configuration (AGENT_NAME, AGENT_DESCRIPTION, etc.)

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
- `AGENT_DESCRIPTION` - Human-readable description of the agent
- `AGENT_VERSION` - Semantic version (e.g., "0.1.0")
- `PAYMENTS_FACILITATOR_URL` - x402 facilitator endpoint
- `PAYMENTS_NETWORK` - Network identifier (e.g., "ethereum")
- `PAYMENTS_RECEIVABLE_ADDRESS` - Address that receives payments
- `PRIVATE_KEY` - Wallet private key (optional)

All arguments are stored in `.env` file after generation.

## How to Add Entrypoints

An entrypoint is a capability/skill your agent exposes. Here's the pattern:

```typescript
import { z } from "zod";

// Add after existing entrypoints
addEntrypoint({
  key: "greet",
  description: "Greet a user by name",
  input: z.object({
    name: z.string().min(1, "Name is required"),
  }),
  output: z.object({
    message: z.string(),
  }),
  handler: async ({ input }) => {
    return {
      output: {
        message: `Hello, ${input.name}!`,
      },
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };
  },
});
```

### Entrypoint with Multiple Fields

```typescript
addEntrypoint({
  key: "calculate",
  description: "Perform basic arithmetic",
  input: z.object({
    operation: z.enum(["add", "subtract", "multiply", "divide"]),
    a: z.number(),
    b: z.number(),
  }),
  output: z.object({
    result: z.number(),
  }),
  handler: async ({ input }) => {
    let result: number;
    switch (input.operation) {
      case "add":
        result = input.a + input.b;
        break;
      case "subtract":
        result = input.a - input.b;
        break;
      case "multiply":
        result = input.a * input.b;
        break;
      case "divide":
        result = input.a / input.b;
        break;
    }
    return {
      output: { result },
    };
  },
});
```

## How to Add Payments to an Entrypoint

To make an entrypoint require payment:

```typescript
addEntrypoint({
  key: "premium-feature",
  description: "A paid feature",
  input: z.object({ data: z.string() }),
  price: "0.1", // Price denominated in USDC (decimal string)
  // Or different prices for invoke vs stream:
  // price: { invoke: "1000", stream: "500" },
  handler: async ({ input }) => {
    return {
      output: { result: "premium result" },
    };
  },
});
```

The payment will be automatically enforced by the x402 paywall middleware if configured via environment variables.

## How to Access Request Context

The handler receives an `AgentContext` with useful information:

```typescript
handler: async (ctx) => {
  // ctx.key - the entrypoint key
  // ctx.input - the parsed and validated input
  // ctx.signal - AbortSignal for cancellation
  // ctx.metadata - Protocol-specific metadata (e.g., { headers } for HTTP)
  // ctx.runId - Unique run identifier

  console.log(`Processing request for ${ctx.key} with run ID ${ctx.runId}`);

  return {
    output: { data: "result" },
  };
};
```

## Environment Variables Guide

Required variables (set in `.env`):

```bash
AGENT_NAME=my-agent
AGENT_VERSION=0.1.0
AGENT_DESCRIPTION=My custom agent

# Optional: Payment configuration
PAYMENTS_FACILITATOR_URL=https://facilitator.daydreams.systems
PAYMENTS_NETWORK=ethereum
PAYMENTS_RECEIVABLE_ADDRESS=0x...

# Optional: Wallet private key for authenticated operations
PRIVATE_KEY=0x...
```

## Testing Your Agent

### Local Testing with cURL

```bash
# Start the agent
bun run dev

# Test the health endpoint
curl http://localhost:3000/health

# Test the echo entrypoint
curl -X POST http://localhost:3000/entrypoints/echo/invoke \
  -H "Content-Type: application/json" \
  -d '{"input": {"text": "Hello World"}}'

# Get the agent manifest
curl http://localhost:3000/.well-known/agent.json
```

### Testing with TypeScript

```typescript
const response = await fetch("http://localhost:3000/entrypoints/echo/invoke", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    input: { text: "test" },
  }),
});

const result = await response.json();
console.log(result.output);
```

## Common Patterns

### Error Handling in Entrypoints

```typescript
handler: async ({ input }) => {
  try {
    // Your logic here
    const result = await someOperation(input.data);
    return {
      output: { result },
    };
  } catch (error) {
    // Errors are automatically handled by the framework
    // and returned as JSON with error.code and message
    throw error;
  }
};
```

### Async Operations

```typescript
handler: async ({ input }) => {
  // Fetch from external API
  const response = await fetch(`https://api.example.com/data/${input.id}`);
  const data = await response.json();

  return {
    output: { data },
  };
};
```

### Using Multiple Entrypoints

```typescript
// In src/agent.ts

addEntrypoint({
  key: "entrypoint1",
  description: "First capability",
  handler: async () => ({ output: { result: "one" } }),
});

addEntrypoint({
  key: "entrypoint2",
  description: "Second capability",
  handler: async () => ({ output: { result: "two" } }),
});

// Each becomes available at:
// POST /entrypoints/entrypoint1/invoke
// POST /entrypoints/entrypoint2/invoke
```

## API Reference

### Core Functions

**createAgentApp(meta, options?)**

- `meta`: Object with `name`, `version`, `description`
- `options.payments`: Payment configuration to enable paid entrypoints
- Returns: `{ app, addEntrypoint, config, payments }`

**addEntrypoint(definition)**

- `definition.key`: Unique identifier (string)
- `definition.description`: Human-readable description (optional)
- `definition.input`: Zod schema for input validation (optional)
- `definition.output`: Zod schema for output validation (optional)
- `definition.price`: Payment requirement (optional, string or object)
- `definition.handler`: Async function that processes requests

### Available Routes

- `GET /health` - Health check
- `GET /entrypoints` - List all entrypoints
- `GET /.well-known/agent.json` - Full agent manifest (A2A format)
- `POST /entrypoints/:key/invoke` - Invoke an entrypoint
- `POST /entrypoints/:key/stream` - Stream an entrypoint (if streaming enabled)

## Troubleshooting

### Agent won't start

Check that:

1. `.env` file exists with required variables
2. `bun install` has been run
3. Port 3000 is available (or set PORT environment variable)

### Entrypoint returns 404

Ensure:

1. The entrypoint key matches exactly (case-sensitive)
2. You're using the correct HTTP method (POST)
3. The entrypoint was added with `addEntrypoint()` before exporting

### Payment errors

Verify:

1. All payment environment variables are set correctly
2. `PAYMENTS_RECEIVABLE_ADDRESS` is a valid address
3. `PAYMENTS_FACILITATOR_URL` is reachable
4. Network identifier matches the facilitator's supported networks

### Type errors

Run type checking:

```bash
bunx tsc --noEmit
```

Common fixes:

- Ensure Zod schemas match your input/output types
- Import types from `@lucid-agents/core/types`
- Check that all required fields are present in input objects

## Next Steps

1. **Add your first custom entrypoint** - Follow the patterns above
2. **Configure payments** - Set up x402 payment variables if needed
3. **Test locally** - Use cURL or Postman to test your endpoints
4. **Deploy** - Use a Bun-compatible hosting platform

## Additional Resources

- [@lucid-agents/core documentation](../../../core/README.md)
- [Agent Payments Protocol (AP2)](https://github.com/google-agentic-commerce/ap2)
- [A2A Protocol](https://agent2agent.ai/)
