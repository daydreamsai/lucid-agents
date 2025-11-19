# Lucid Agents Monorepo - AI Coding Guide

This guide helps AI coding agents understand and work with the lucid-agents monorepo effectively.

## Project Overview

This is a TypeScript/Bun monorepo for building, monetizing, and verifying AI agents. It provides:

- **@lucid-agents/agent-kit** - Core framework for creating agent HTTP servers
- **@lucid-agents/agent-kit-identity** - ERC-8004 identity and trust layer
- **@lucid-agents/create-agent-kit** - CLI for scaffolding new agent projects

**Tech Stack:**

- Runtime: Bun (Node.js 20+ compatible)
- Language: TypeScript (ESM, strict mode)
- Build: tsup
- Package Manager: Bun workspaces
- Versioning: Changesets

## Architecture Overview

### Package Dependencies

```
create-agent-kit (CLI tool)
    ↓ scaffolds projects using
agent-kit-hono OR agent-kit-tanstack (adapter frameworks)
    ↓ both use
agent-kit (core runtime)
    ↓ optionally uses
agent-kit-identity (ERC-8004 integration)
```

### Adapter System

The framework supports multiple runtime adapters:

- **Hono** (`@lucid-agents/agent-kit-hono`) - Traditional HTTP server
- **Express** (`@lucid-agents/agent-kit-express`) - Node.js/Express server with x402 middleware
- **TanStack Start UI** (`@lucid-agents/agent-kit-tanstack`) - Full-stack React with dashboard
- **TanStack Start Headless** - API-only variant

Templates are adapter-agnostic and work with any compatible adapter.

### Data Flow

```
HTTP Request
    ↓
Adapter Router (Hono, Express, or TanStack)
    ↓
x402 Paywall Middleware (if configured)
    ↓
Runtime Handler (agent-kit core)
    ↓
Entrypoint Handler
    ↓
Response (JSON or SSE stream)
```

### Key Architectural Decisions

1. **Multi-adapter support** - Same agent logic works with different frameworks
2. **Template-based scaffolding** - Templates use `.template` extensions for clean code generation
3. **Zod for validation** - Schema-first approach for input/output
4. **Server-Sent Events for streaming** - Standard SSE for real-time responses
5. **ERC-8004 for identity** - On-chain agent identity and reputation
6. **x402 for payments** - HTTP-native payment protocol supporting both EVM and Solana networks

### Supported Payment Networks

The framework supports payment receiving on multiple blockchain networks:

**EVM Networks:**

- `base` - Base mainnet (L2, low cost)
- `base-sepolia` - Base Sepolia testnet
- `ethereum` - Ethereum mainnet
- `sepolia` - Ethereum Sepolia testnet

**Solana Networks:**

- `solana` - Solana mainnet (high throughput, low fees)
- `solana-devnet` - Solana devnet

**Key Differences:**

- **EVM**: EIP-712 signatures, ERC-20 tokens (USDC), 0x-prefixed addresses
- **Solana**: Ed25519 signatures, SPL tokens (USDC), Base58 addresses
- **Transaction finality**: Solana (~400ms) vs EVM (12s-12min)
- **Gas costs**: Solana (~$0.0001) vs EVM ($0.01-$10)

**Identity vs Payments:**

- Identity registration (ERC-8004): EVM-only (smart contract on Ethereum chains)
- Payment receiving: Any supported network (EVM or Solana)
- These are independent: register identity on Base, receive payments on Solana

## Code Structure Principles

These principles guide how we organize and structure code across the monorepo. Follow them when writing new code or refactoring existing code.

### 1. Single Source of Truth

**One type definition per concept.** Avoid duplicate types like `PaymentsRuntimeInternal` vs `PaymentsRuntime`. If you need variations, use type composition or generics, not separate type definitions.

**Bad:**

```typescript
// Internal type
type PaymentsRuntimeInternal = { config: PaymentsConfig | undefined; activate: ... };
// Public type
type PaymentsRuntime = { config: PaymentsConfig; requirements: ... };
```

**Good:**

```typescript
// One type definition
type PaymentsRuntime = {
  config: PaymentsConfig;
  isActive: boolean;
  requirements: ...;
  activate: ...;
};
```

### 2. Encapsulation at the Right Level

**Domain complexity belongs in the owning package.** The payments package should handle all payments-related complexity. The core runtime should use it directly without transformation layers.

**Bad:**

```typescript
// In core runtime - wrapping payments runtime
const paymentsRuntime = payments.config ? {
  get config() { return payments.config!; },
  get isActive() { return payments.isActive; },
  requirements(...) { return evaluatePaymentRequirement(...); }
} : undefined;
```

**Good:**

```typescript
// In payments package - returns complete runtime
export function createPaymentsRuntime(...): PaymentsRuntime | undefined {
  return {
    config,
    isActive,
    requirements(...) { ... },
    activate(...) { ... }
  };
}

// In core runtime - use directly
const payments = createPaymentsRuntime(...);
return { payments };
```

### 3. Direct Exposure

**Expose runtimes directly without unnecessary wrappers.** If the type matches what's needed, pass it through. Don't create intermediate objects or getters unless there's a clear need.

**Bad:**

```typescript
return {
  get payments() {
    return payments.config ? { ...wrappedObject } : undefined;
  },
};
```

**Good:**

```typescript
return {
  wallets,
  payments,
};
```

### 4. Consistency

**Similar concepts should follow the same pattern.** If `wallets` is exposed directly, `payments` should be too. Consistency reduces cognitive load and makes the codebase easier to understand.

**Example:**

```typescript
// Both follow the same pattern
const wallets = createWalletsRuntime(config);
const payments = createPaymentsRuntime(opts?.payments, config);

return {
  wallets, // Direct exposure
  payments, // Direct exposure
};
```

### 5. Public API Clarity

**If something needs to be used by consumers, include it in the public type.** Don't hide methods or use type casts. The public API should be complete and type-safe.

**Bad:**

```typescript
// Internal method not in public type
payments.activate(def); // Type error or requires cast
```

**Good:**

```typescript
// Public type includes all needed methods
type PaymentsRuntime = {
  config: PaymentsConfig;
  isActive: boolean;
  requirements: ...;
  activate: (entrypoint: EntrypointDef) => void; // Public method
};
```

### 6. Simplicity Over Indirection

**Avoid unnecessary getters, wrappers, and intermediate objects.** Prefer straightforward code. Add complexity only when there's a clear benefit.

**Bad:**

```typescript
// Unnecessary wrapper
const paymentsRuntime = {
  get config() { return payments.config!; },
  get isActive() { return payments.isActive; },
  requirements(...) { return evaluate(...); }
};
```

**Good:**

```typescript
// Direct use
payments.requirements(...);
```

### 7. Domain Ownership

**Each package should own its complexity.** The payments package creates and returns a complete `PaymentsRuntime` with all its methods. Consumers use it as-is without transformation.

**Principle:** Each package should return what consumers need, and consumers should use it directly without transformation layers.

### 8. No Premature Abstraction

**Avoid layers like `sync()`, `resolvedConfig` vs `activeConfig`, etc.** Keep it simple until you actually need the complexity. YAGNI (You Aren't Gonna Need It) applies.

**Bad:**

```typescript
// Multiple config states
type PaymentsRuntime = {
  config: PaymentsConfig | undefined;
  resolvedConfig: PaymentsConfig | undefined;
  activeConfig: PaymentsConfig | undefined;
  sync: (agent: AgentCore) => void;
};
```

**Good:**

```typescript
// Single config state
type PaymentsRuntime = {
  config: PaymentsConfig;
  isActive: boolean;
  activate: (entrypoint: EntrypointDef) => void;
};
```

## Monorepo Structure

```
/
├── packages/
│   ├── agent-kit/          # Core runtime (shared)
│   │   ├── src/
│   │   │   ├── config.ts         # Config management
│   │   │   ├── manifest.ts       # Manifest generation
│   │   │   ├── runtime.ts        # Core runtime logic
│   │   │   ├── types.ts          # Core types
│   │   │   └── utils/            # Helper utilities
│   │   └── AGENTS.md             # Package-specific guide
│   │
│   ├── agent-kit-hono/     # Hono adapter
│   │   ├── src/
│   │   │   ├── app.ts            # createAgentApp() for Hono
│   │   │   └── paywall.ts        # x402 Hono middleware
│   │   └── examples/
│   │
│   ├── agent-kit-express/  # Express adapter
│   │   ├── src/
│   │   │   ├── app.ts            # createAgentApp() for Express
│   │   │   └── paywall.ts        # x402 Express middleware
│   │   └── __tests__/            # Adapter smoke tests
│   │
│   ├── agent-kit-tanstack/ # TanStack adapter
│   │   ├── src/
│   │   │   ├── runtime.ts        # createTanStackRuntime()
│   │   │   └── paywall.ts        # x402 TanStack middleware
│   │   └── examples/
│   │
│   ├── agent-kit-identity/ # ERC-8004 identity
│   │   ├── src/
│   │   │   ├── init.ts           # createAgentIdentity()
│   │   │   ├── registries/       # Registry clients
│   │   │   └── utils/            # Identity utilities
│   │   └── examples/
│   │
│   └── create-agent-kit/   # CLI scaffolding tool
│       ├── src/
│       │   ├── index.ts          # CLI implementation
│       │   └── adapters.ts       # Adapter definitions
│       ├── adapters/             # Runtime frameworks
│       │   ├── hono/             # Hono base files
│       │   ├── express/          # Express base files
│       │   └── tanstack/         # TanStack base files
│       │       ├── ui/           # Full UI variant
│       │       └── headless/     # API-only variant
│       └── templates/            # Project templates
│           ├── blank/            # Minimal agent
│           ├── axllm/            # LLM-powered agent
│           ├── axllm-flow/       # Multi-step workflows
│           └── identity/         # Identity-enabled agent
│
├── scripts/
│   ├── build-packages.ts   # Build script
│   └── changeset-publish.ts # Publish script
│
└── package.json            # Workspace config
```

## Build & Development Commands

### Workspace-Level Commands

```bash
# Install all dependencies
bun install

# Build all packages
bun run build
# or
bun run build:packages

# Version packages (for release)
bun run changeset
bun run release:version

# Publish packages
bun run release:publish

# Full release flow
bun run release
```

### Package-Level Commands

```bash
# Work in a specific package
cd packages/agent-kit

# Build this package
bun run build

# Run tests
bun test

# Type check
bunx tsc --noEmit

# Watch mode (if configured)
bun run dev
```

## API Quick Reference

### Hono Adapter

**createAgentApp(meta, options?)**

```typescript
import { createAgentApp } from '@lucid-agents/agent-kit-hono';

const { app, addEntrypoint } = createAgentApp(
  {
    name: 'my-agent',
    version: '0.1.0',
    description: 'Agent description',
  },
  {
    config: {
      payments: {
        /* x402 config */
      },
      wallet: {
        /* wallet config */
      },
    },
    useConfigPayments: true,
    ap2: { roles: ['merchant'] },
    trust: {
      /* ERC-8004 config */
    },
  }
);
```

### Express Adapter

**createAgentApp(meta, options?)**

```typescript
import { createAgentApp } from '@lucid-agents/agent-kit-express';

const { app, addEntrypoint } = createAgentApp(
  {
    name: 'my-agent',
    version: '0.1.0',
    description: 'Agent description',
  },
  typeof appOptions !== 'undefined' ? appOptions : {}
);

// Express apps need to listen on a port
const server = app.listen(process.env.PORT ?? 3000);
```

### TanStack Adapter

**createTanStackRuntime(meta, options?)**

```typescript
import { createTanStackRuntime } from '@lucid-agents/agent-kit-tanstack';

const { runtime, handlers } = createTanStackRuntime(
  {
    name: 'my-agent',
    version: '0.1.0',
    description: 'Agent description',
  },
  {
    config: {
      payments: { /* x402 config */ },
    },
    useConfigPayments: true,
  }
);

// Use runtime.addEntrypoint() instead of addEntrypoint()
runtime.addEntrypoint({ ... });

// Export for TanStack routes
export { runtime, handlers };
```

**addEntrypoint(definition)**

```typescript
addEntrypoint({
  key: 'echo',
  description: 'Echo back input',
  input: z.object({ text: z.string() }),
  output: z.object({ text: z.string() }),
  price: '1000', // Optional x402 price
  handler: async ctx => {
    return {
      output: { text: ctx.input.text },
      usage: { total_tokens: 0 },
    };
  },
});
```

**paymentsFromEnv()**

```typescript
import { paymentsFromEnv } from '@lucid-agents/agent-kit';

const payments = paymentsFromEnv();
// Returns PaymentsConfig or undefined
```

### agent-kit-identity Core Functions

**createAgentIdentity(options)**

```typescript
import { createAgentIdentity } from '@lucid-agents/agent-kit-identity';

const identity = await createAgentIdentity({
  domain: 'agent.example.com',
  autoRegister: true, // Register if not exists
});

// Returns:
// - identity.record (if registered)
// - identity.clients (registry clients)
// - identity.trust (trust config)
// - identity.didRegister (whether just registered)
```

**getTrustConfig(identity)**

```typescript
import { getTrustConfig } from '@lucid-agents/agent-kit-identity';

const trustConfig = getTrustConfig(identity);
// Returns TrustConfig for agent manifest
```

### create-agent-kit CLI

**Interactive Mode**

```bash
bunx @lucid-agents/create-agent-kit my-agent
```

**With Adapter Selection**

```bash
# Hono adapter (traditional HTTP server)
bunx @lucid-agents/create-agent-kit my-agent --adapter=hono

# Express adapter (Node-style HTTP server)
bunx @lucid-agents/create-agent-kit my-agent --adapter=express

# TanStack UI (full dashboard)
bunx @lucid-agents/create-agent-kit my-agent --adapter=tanstack-ui

# TanStack Headless (API only)
bunx @lucid-agents/create-agent-kit my-agent --adapter=tanstack-headless
```

**Non-Interactive Mode**

```bash
bunx @lucid-agents/create-agent-kit my-agent \
  --adapter=tanstack-ui \
  --template=identity \
  --non-interactive \
  --AGENT_DESCRIPTION="My custom agent" \
  --PAYMENTS_RECEIVABLE_ADDRESS="0x..."
```

## How the Template System Works

### Template Structure

Each template in `packages/create-agent-kit/templates/` contains:

```
template-name/
├── src/
│   ├── agent.ts         # Agent definition
│   └── index.ts         # Server setup
├── package.json         # Dependencies
├── tsconfig.json        # TypeScript config
├── template.json        # Wizard configuration
├── template.schema.json # JSON Schema for arguments
├── AGENTS.md            # Template-specific guide
└── README.md            # User-facing docs
```

### Wizard Flow

1. **Parse CLI args** - Extract flags like `--template=identity --KEY=value`
2. **Load templates** - Scan `templates/` directory
3. **Resolve template** - Match `--template` flag or prompt user
4. **Collect wizard answers**:
   - Use pre-supplied `--KEY=value` flags if present
   - Otherwise, prompt user (or use defaults in `--non-interactive`)
5. **Copy template** - Copy entire template directory to target
6. **Transform files**:
   - Update `package.json` with actual package name
   - Replace `{{AGENT_NAME}}` tokens in README
   - Generate `.env` with wizard answers
7. **Remove artifacts** - Delete `template.json`
8. **Install dependencies** - Run `bun install` if requested

### How to Modify an Existing Template

1. Edit files in `packages/create-agent-kit/templates/[template-name]/`
2. Update `template.json` if adding wizard prompts
3. Update `template.schema.json` to document new arguments
4. Update `AGENTS.md` with examples of new features
5. Test:
   ```bash
   cd packages/create-agent-kit
   bun run build
   cd ../..
   bunx ./packages/create-agent-kit/dist/index.js test-agent --template=[template-name]
   ```

### How to Create a New Template

1. Create directory: `packages/create-agent-kit/templates/my-template/`
2. Add required files:
   ```bash
   mkdir -p src
   # Create src/agent.ts, src/index.ts
   # Copy package.json, tsconfig.json from blank template
   ```
3. Create `template.json`:
   ```json
   {
     "id": "my-template",
     "name": "My Template",
     "description": "Description here",
     "wizard": {
       "prompts": [
         {
           "key": "SOME_CONFIG",
           "type": "input",
           "message": "Enter config value:",
           "defaultValue": "default"
         }
       ]
     }
   }
   ```
4. Create `template.schema.json` documenting all arguments
5. Create `AGENTS.md` with comprehensive examples
6. Test the template
7. Add to help text in `src/index.ts`

## Testing Conventions

### Unit Tests

Located in `src/__tests__/` within each package:

```typescript
import { describe, expect, test } from 'bun:test';

describe('MyModule', () => {
  test('should do something', () => {
    expect(something()).toBe(expected);
  });
});
```

Run tests:

```bash
bun test                    # All tests
bun test src/__tests__/specific.test.ts  # Specific test
```

### Integration Tests

Example-based testing in `examples/` directories:

```bash
cd packages/agent-kit/examples
bun run client.ts           # Test against running agent
```

### Testing create-agent-kit

```bash
# Test template generation
cd /tmp
bunx /path/to/lucid-agents/packages/create-agent-kit/dist/index.js test-agent --template=blank
cd test-agent
bun install
bun run dev
```

## Release Process with Changesets

### Creating a Changeset

When you make changes:

```bash
bun run changeset
```

This prompts you for:

1. Which packages changed?
2. Semver bump type (major/minor/patch)
3. Summary of changes

Creates a file in `.changeset/` describing the change.

### Versioning

```bash
bun run release:version
```

This:

1. Reads all changeset files
2. Updates package.json versions
3. Updates CHANGELOG.md files
4. Removes processed changeset files

### Publishing

```bash
bun run release:publish
```

This:

1. Builds all packages
2. Publishes to npm

**Full flow:**

```bash
bun run release  # version + publish
```

## Coding Standards

### General

- **No emojis** - Do not use emojis in code, comments, or commit messages unless explicitly requested by the user
- **Re-exports are banned** - Do not re-export types or values from other packages. Define types in the appropriate shared types package (`@lucid-agents/types`) or in the package where they are used. Re-exports create unnecessary coupling and make it unclear where types are actually defined.

### TypeScript

- **ESM only** - Use `import`/`export`, not `require()`
- **Strict mode** - All packages use `strict: true`
- **Explicit types** - Avoid `any`, prefer explicit types or `unknown`
- **Type exports** - Export types separately: `export type { MyType }`

### File Naming

- Source: `kebab-case.ts`
- Types: `types.ts` or inline
- Tests: `*.test.ts` in `__tests__/`
- Examples: Descriptive names in `examples/`

### Code Organization

**Package structure:**

```
src/
├── index.ts           # Main exports
├── types.ts           # Type definitions
├── feature1.ts        # Feature implementation
├── feature2.ts
├── utils/
│   └── helpers.ts     # Utility functions
└── __tests__/
    └── feature1.test.ts
```

**Export patterns:**

```typescript
// index.ts
export { mainFunction } from './feature1';
export { helperFunction } from './utils/helpers';
export type { MyType } from './types';
```

### Common Patterns

**Error handling:**

```typescript
try {
  const result = await operation();
  return result;
} catch (error) {
  throw new Error(`Operation failed: ${(error as Error).message}`);
}
```

**Environment variables:**

```typescript
const value = process.env.KEY;
if (!value) {
  throw new Error('KEY environment variable required');
}
```

**Zod schemas:**

```typescript
import { z } from 'zod';

const schema = z.object({
  field: z.string().min(1),
  optional: z.number().optional(),
});

type Parsed = z.infer<typeof schema>;
```

## How Packages Interact

### agent-kit → agent-kit-identity

```typescript
// agent-kit imports identity types
import type { TrustConfig } from '@lucid-agents/agent-kit-identity';

// agent-kit accepts trust config
createAgentApp(meta, {
  trust: trustConfig, // From agent-kit-identity
});
```

### create-agent-kit → agent-kit + agent-kit-identity

Templates reference both packages:

```typescript
// In generated agent.ts
import { createAgentApp } from '@lucid-agents/agent-kit';
import { createAgentIdentity } from '@lucid-agents/agent-kit-identity';
```

The CLI doesn't directly import these; it scaffolds code that uses them.

## Common Development Tasks

### Adding a New Feature to agent-kit

1. Create implementation in `packages/agent-kit/src/feature.ts`
2. Add types to `types.ts` or inline
3. Export from `index.ts`
4. Add tests in `__tests__/feature.test.ts`
5. Update `README.md` with examples
6. Update `AGENTS.md` with AI-focused guide
7. Create changeset: `bun run changeset`

### Adding a New Entrypoint Type

1. Update `EntrypointDef` type in `types.ts`
2. Update manifest generation in `manifest.ts`
3. Update routing in `app.ts`
4. Add examples showing the new type
5. Update template files if relevant

### Modifying the CLI

1. Edit `packages/create-agent-kit/src/index.ts`
2. Build: `cd packages/create-agent-kit && bun run build`
3. Test locally: `bunx ./dist/index.js test-agent`
4. Update help text and README
5. Create changeset

## Troubleshooting

### "Module not found" errors

Ensure:

1. All packages are built: `bun run build:packages`
2. Dependencies are installed: `bun install`
3. Using correct import paths (e.g., `@lucid-agents/agent-kit/types`)

### TypeScript errors in templates

Templates use the built packages:

1. Build packages first
2. Check that template `package.json` references correct versions
3. Run `bunx tsc --noEmit` in template directory

### Changesets not working

Ensure:

1. You're in the repo root
2. Changes are committed to git
3. `.changeset` directory exists
4. Run `bunx changeset` not `bun run changeset` if workspace command fails

### Build fails

Check:

1. TypeScript version matches across packages
2. All imports are resolvable
3. No circular dependencies
4. Run `bun install` again

## Key Files and Their Purposes

### packages/agent-kit/src/http/runtime.ts

Core HTTP runtime that adapters wrap. Handles manifest building, entrypoint registry, streaming helpers, and payment evaluation.

### packages/agent-kit-hono/src/app.ts

Hono-specific `createAgentApp()` implementation. Wires Fetch handlers to Hono routes and installs the x402 middleware.

### packages/agent-kit-express/src/app.ts

Express-specific `createAgentApp()` implementation. Bridges Node requests/responses to the Fetch-based runtime and installs the x402 Express middleware.

### packages/agent-kit/src/manifest.ts

Generates AgentCard and manifest JSON. Includes A2A skills, payments metadata, trust registrations.

### packages/agent-kit/src/paywall.ts

x402 payment middleware. Checks payment headers, validates with facilitator, enforces pricing.

### packages/agent-kit/src/types.ts

Core type definitions: `EntrypointDef`, `AgentContext`, `AgentMeta`, `PaymentsConfig`, etc.

### packages/agent-kit-identity/src/init.ts

Main `createAgentIdentity()` function. Bootstraps ERC-8004 identity, handles auto-registration.

### packages/agent-kit-identity/src/registries/

Registry client implementations for Identity, Reputation, and Validation registries.

### packages/create-agent-kit/src/index.ts

CLI implementation. Handles argument parsing, wizard prompts, template copying, file transformation.

## Additional Resources

- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines
- [agents.md](https://agents.md/) - AGENTS.md standard documentation
- [ERC-8004 Specification](https://eips.ethereum.org/EIPS/eip-8004)
- [Hono Documentation](https://hono.dev/)
- [Express Documentation](https://expressjs.com/)
- [Bun Documentation](https://bun.sh/docs)
- [x402 Protocol](https://github.com/paywithx402)

## Questions or Issues?

When working on this codebase:

1. **Check package READMEs** - Each package has detailed documentation
2. **Check AGENTS.md files** - Package-specific guides for AI agents
3. **Look at examples** - All packages have `examples/` directories
4. **Review tests** - Tests show expected behavior
5. **Check changesets** - Recent changes documented in `.changeset/`
