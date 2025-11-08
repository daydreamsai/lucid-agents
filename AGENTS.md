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
agent-kit (core framework)
    ↓ optionally uses
agent-kit-identity (ERC-8004 integration)
```

### Data Flow

```
HTTP Request
    ↓
Hono Router (agent-kit)
    ↓
x402 Paywall Middleware (if configured)
    ↓
Entrypoint Handler
    ↓
Response (JSON or SSE stream)
```

### Key Architectural Decisions

1. **Hono-based routing** - Leverages Hono's lightweight HTTP framework
2. **Zod for validation** - Schema-first approach for input/output
3. **Server-Sent Events for streaming** - Standard SSE for real-time responses
4. **ERC-8004 for identity** - On-chain agent identity and reputation
5. **x402 for payments** - HTTP-native payment protocol

## Monorepo Structure

```
/
├── packages/
│   ├── agent-kit/          # Core agent framework
│   │   ├── src/
│   │   │   ├── app.ts            # createAgentApp()
│   │   │   ├── manifest.ts       # Manifest generation
│   │   │   ├── paywall.ts        # x402 middleware
│   │   │   ├── runtime.ts        # Runtime utilities
│   │   │   ├── types.ts          # Core types
│   │   │   └── utils/            # Helper utilities
│   │   ├── examples/             # Usage examples
│   │   └── AGENTS.md             # Package-specific guide
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
│       │   └── index.ts          # CLI implementation
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

### agent-kit Core Functions

**createAgentApp(meta, options?)**

```typescript
import { createAgentApp } from "@lucid-agents/agent-kit";

const { app, addEntrypoint } = createAgentApp(
  {
    name: "my-agent",
    version: "0.1.0",
    description: "Agent description",
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
    ap2: { roles: ["merchant"] },
    trust: {
      /* ERC-8004 config */
    },
  }
);
```

**addEntrypoint(definition)**

```typescript
addEntrypoint({
  key: "echo",
  description: "Echo back input",
  input: z.object({ text: z.string() }),
  output: z.object({ text: z.string() }),
  price: "1000", // Optional x402 price
  handler: async (ctx) => {
    return {
      output: { text: ctx.input.text },
      usage: { total_tokens: 0 },
    };
  },
});
```

**paymentsFromEnv()**

```typescript
import { paymentsFromEnv } from "@lucid-agents/agent-kit";

const payments = paymentsFromEnv();
// Returns PaymentsConfig or undefined
```

### agent-kit-identity Core Functions

**createAgentIdentity(options)**

```typescript
import { createAgentIdentity } from "@lucid-agents/agent-kit-identity";

const identity = await createAgentIdentity({
  domain: "agent.example.com",
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
import { getTrustConfig } from "@lucid-agents/agent-kit-identity";

const trustConfig = getTrustConfig(identity);
// Returns TrustConfig for agent manifest
```

### create-agent-kit CLI

**Interactive Mode**

```bash
bunx @lucid-agents/create-agent-kit my-agent
```

**Non-Interactive Mode (NEW)**

```bash
bunx @lucid-agents/create-agent-kit my-agent \
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
import { describe, expect, test } from "bun:test";

describe("MyModule", () => {
  test("should do something", () => {
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
export { mainFunction } from "./feature1";
export { helperFunction } from "./utils/helpers";
export type { MyType } from "./types";
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
  throw new Error("KEY environment variable required");
}
```

**Zod schemas:**

```typescript
import { z } from "zod";

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
import type { TrustConfig } from "@lucid-agents/agent-kit-identity";

// agent-kit accepts trust config
createAgentApp(meta, {
  trust: trustConfig, // From agent-kit-identity
});
```

### create-agent-kit → agent-kit + agent-kit-identity

Templates reference both packages:

```typescript
// In generated agent.ts
import { createAgentApp } from "@lucid-agents/agent-kit";
import { createAgentIdentity } from "@lucid-agents/agent-kit-identity";
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

### packages/agent-kit/src/app.ts

Main agent app creation logic. Contains `createAgentApp()` which sets up Hono routes, middleware, and entrypoint registration.

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
- [Bun Documentation](https://bun.sh/docs)
- [x402 Protocol](https://github.com/paywithx402)

## Questions or Issues?

When working on this codebase:

1. **Check package READMEs** - Each package has detailed documentation
2. **Check AGENTS.md files** - Package-specific guides for AI agents
3. **Look at examples** - All packages have `examples/` directories
4. **Review tests** - Tests show expected behavior
5. **Check changesets** - Recent changes documented in `.changeset/`
