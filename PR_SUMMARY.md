# PR Summary: Extension-Based Architecture Refactoring

## Overview

This PR refactors the Lucid Agents framework from an imperative, monolithic app creation system to a modular, extension-based architecture. The core runtime is now protocol-agnostic, with HTTP functionality extracted into its own extension package. This enables a plugin-style architecture where extensions can be composed to build agent runtimes with only the capabilities needed.

## Architecture Changes

### Before

```typescript
// Monolithic app creation with all features bundled
const runtime = createAgentRuntime(meta, {
  config: { payments, wallets },
  http: { landingPage: true },
  trust: { ... },
});
```

### After

```typescript
// Composable extension-based architecture
const agent = await createAgent(meta)
  .use(http())
  .use(wallets({ config: { wallets: walletsFromEnv() } }))
  .use(payments({ config: paymentsFromEnv() }))
  .use(identity({ config: identityFromEnv() }))
  .use(a2a())
  .use(ap2({ roles: ['merchant'] }))
  .build();
```

## Key Changes

### Extension System

Introduced a new `AgentBuilder` class that manages extension registration and builds a consolidated runtime. The builder:

- Manages extension registration via `.use(extension)`
- Builds consolidated runtime with type-safe composition
- Detects and prevents property conflicts between extensions
- Supports lifecycle hooks: `onEntrypointAdded`, `onBuild`, `onManifestBuild`

All existing features (payments, identity, wallets, a2a, ap2) have been converted to extensions:

- `packages/payments/src/extension.ts`: Payments extension with payment requirements and manifest metadata
- `packages/identity/src/extension.ts`: Identity extension contributing ERC-8004 trust config with automatic identity creation
- `packages/wallet/src/extension.ts`: Wallets extension for wallet runtime management
- `packages/a2a/src/extension.ts`: A2A extension with runtime initialization hooks
- `packages/ap2/src/extension.ts`: AP2 extension contributing payment metadata to manifest

### HTTP as Separate Package

Created new `@lucid-agents/http` package containing all HTTP-specific functionality:

- HTTP extension (`packages/http/src/extension.ts`): Contributes HTTP handlers via `onBuild` hook
- HTTP invocation logic (`packages/http/src/invoke.ts`): Request/response handling for entrypoint invocations
- HTTP streaming logic (`packages/http/src/stream.ts`): Server-Sent Events streaming for entrypoints
- Input/output validation (`packages/http/src/validation.ts`): Zod schema validation for HTTP requests
- HTTP utilities (`packages/http/src/http-utils.ts`): Common helpers (`jsonResponse`, `errorResponse`, etc.)
- Landing page renderer (`packages/http/src/landing-page.ts`): Agent landing page HTML
- SSE utilities (`packages/http/src/sse.ts`): Server-Sent Events helpers

HTTP types moved to `@lucid-agents/types/http`:

- `HttpExtensionOptions`
- `AgentHttpHandlers`
- `EntrypointDef`, `EntrypointHandler`, `EntrypointStreamHandler`
- `StreamEnvelope`, `StreamPushEnvelope`, `StreamResult`

### Protocol-Agnostic Core

Removed all HTTP-specific functionality from `AgentCore`:

- Removed `invoke()`, `stream()`, and `resolveManifest()` methods (HTTP-specific)
- Removed `parseInput()` and `parseOutput()` validation methods (moved to HTTP extension)
- Removed `InvokeContext`, `StreamContext`, `InvokeResult` types (moved to HTTP types)

Made `AgentContext` protocol-agnostic:

- Removed `headers: Headers` property (HTTP-specific)
- Added `metadata?: Record<string, unknown>` for protocol-agnostic metadata
- HTTP extension now adds `headers` to `metadata` during request handling

Manifest building moved to runtime:

- Removed `agent.resolveManifest()` from `AgentCore`
- Added `runtime.manifest.build(origin)` method

### Type System

Added extension system types in `@lucid-agents/types/core`:

- `Extension` interface: Standard contract for all extensions
- `BuildContext` type: Context passed to extension's `build()` method
- `UnionToIntersection` utility type: Merges extension runtime slices
- `AppRuntime` utility type: Type-safe runtime composition

Moved shared types:

- `ZodValidationError` moved from `@lucid-agents/core` to `@lucid-agents/types/core` (shared error class)

### Identity Package Refactoring

Refactored `@lucid-agents/identity` to work seamlessly with the extension-based architecture and SDK:

**Extension-Based Integration:**

- Created `identity()` extension function (`packages/identity/src/extension.ts`) that integrates with the extension system
- Extension automatically creates ERC-8004 identity during `onBuild` hook if config is provided
- Supports two modes:
  - **Automatic mode**: Provide `domain` or `autoRegister` in config, identity is created automatically during build
  - **Manual mode**: Call `createAgentIdentity()` after runtime is built for more control

**SDK Integration:**

- `createAgentIdentity()` now requires `runtime: AgentRuntime` parameter (breaking change)
- Requires access to `runtime.wallets.agent` for wallet operations
- Better integration with the extension system - identity creation can happen automatically during build
- All async operations in `onBuild` hooks are automatically awaited by the builder

**New Utilities:**

- Added `identityFromEnv()` helper (`packages/identity/src/env.ts`) to load identity config from environment variables
- Supports both `REGISTER_IDENTITY` and `IDENTITY_AUTO_REGISTER` environment variables
- Reads from `AGENT_DOMAIN`, `RPC_URL`, `CHAIN_ID` environment variables

**Benefits:**

- Identity can be configured declaratively via extension config
- Automatic identity creation during build eliminates boilerplate
- Still supports manual identity creation for advanced use cases
- Better type safety and integration with the runtime

### Utility Cleanup

Removed `toJsonSchemaOrUndefined()` utility function:

- Was duplicated across multiple packages (`core`, `hono`, `a2a`)
- Unnecessary wrapper that hid conversion failures
- Inlined `z.toJSONSchema()` directly where needed (without try/catch wrapper)

### Package Consolidation

Merged `@lucid-agents/x402-tanstack-start` into `@lucid-agents/tanstack`:

- Moved payment middleware to `packages/tanstack/src/x402-paywall.ts`
- Updated dependencies in `packages/tanstack/package.json`
- Removed `packages/x402-tanstack-start` package
- Updated all imports throughout codebase

### Build Process

Updated build order in `packages/cli/scripts/build-packages.ts`:

- Added `@lucid-agents/http` to extensions layer (built before core)
- Removed `@lucid-agents/x402-tanstack-start` from build order

### Adapters

Updated all framework adapters (`@lucid-agents/hono`, `@lucid-agents/express`, `@lucid-agents/tanstack`):

- Accept `AgentRuntime | AppBuilder` as first argument
- Explicitly require `http()` extension (checked via `runtime.handlers` presence)
- Updated to use extension-based API in generated code

### CLI & Templates

Updated all CLI adapter snippets and templates:

- All adapters use `createAgent().use(http()).build()` pattern
- Templates (`blank`, `identity`, `axllm`, `axllm-flow`) updated to add `http` extension
- Template `AGENTS.md` files updated with extension-based examples
- Environment variable names updated in HTTP extension example code:
  - `PRIVATE_KEY` → `AGENT_WALLET_PRIVATE_KEY`
  - `RESOURCE_SERVER_URL` → `AGENT_URL`

### Documentation

Updated all documentation:

- Main `README.md` with extension-based API examples
- `packages/core/README.md` with protocol-agnostic design
- `packages/a2a/README.md` with extension API
- `packages/core/AGENTS.md` with protocol-agnostic `AgentContext`
- Template `AGENTS.md` files with new examples

### Examples & Tests

Updated all examples and tests:

- All examples now use `createAgent().use().build()` pattern
- All tests updated to use extension-based API
- A2A full integration example verified and working
- Identity full integration example updated to use extension-based app creation

## Breaking Changes

### App Creation API

**Before:**

```typescript
const runtime = createAgentRuntime(meta, {
  config: { payments, wallets },
  http: { landingPage: true },
});
```

**After:**

```typescript
const agent = await createAgent(meta)
  .use(http({ landingPage: true }))
  .use(wallets({ config: { wallets: walletsFromEnv() } }))
  .use(payments({ config: paymentsFromEnv() }))
  .build();
```

### HTTP Runtime

**Before:**

```typescript
const httpRuntime = createAgentHttpRuntime(meta, options);
```

**After:**

```typescript
const agent = await createAgent(meta).use(http(options)).build();
// Access handlers via app.handlers
```

### AgentContext

**Before:**

```typescript
ctx.headers.get('authorization');
```

**After:**

```typescript
(ctx.metadata?.headers as Headers)?.get('authorization');
// HTTP extension provides headers in metadata
```

### Manifest Building

**Before:**

```typescript
agent.resolveManifest(origin, basePath);
```

**After:**

```typescript
runtime.manifest.build(origin);
```

### Imports

**Before:**

```typescript
import {
  createAgentRuntime,
  http,
  ZodValidationError,
} from '@lucid-agents/core';
```

**After:**

```typescript
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { ZodValidationError } from '@lucid-agents/types/core';
```

### Core Invoke/Stream

**Before:**

```typescript
runtime.agent.invoke(key, input, ctx);
runtime.agent.stream(key, input, ctx);
```

**After:**

```typescript
// Use HTTP handlers directly
runtime.handlers.invoke(req, { key });
runtime.handlers.stream(req, { key });

// Or use HTTP extension utilities
import { invoke, stream } from '@lucid-agents/http';
```

### Identity Package

**Before:**

```typescript
// Standalone identity creation
const identity = await createAgentIdentity({
  domain: 'agent.example.com',
  autoRegister: true,
});

// Then manually pass trust config to runtime
const runtime = createAgentRuntime(meta, {
  trust: identity.trust,
});
```

**After:**

```typescript
// Option 1: Automatic via extension (recommended)
const agent = await createAgent(meta)
  .use(wallets({ config: { wallets: walletsFromEnv() } }))
  .use(identity({ config: identityFromEnv() })) // Auto-creates identity during build
  .build();

// Option 2: Manual creation after build
const agent = await createAgent(meta)
  .use(wallets({ config: { wallets: walletsFromEnv() } }))
  .use(identity()) // Extension without auto-create
  .build();

const identity = await createAgentIdentity({
  runtime: app, // Now requires runtime parameter
  domain: process.env.AGENT_DOMAIN,
  autoRegister: true,
});
```

## New Package: `@lucid-agents/http`

### Structure

```
packages/http/
├── src/
│   ├── extension.ts       # HTTP extension definition
│   ├── invoke.ts          # HTTP invocation logic
│   ├── stream.ts          # HTTP streaming logic
│   ├── validation.ts      # Input/output validation
│   ├── http-utils.ts      # Common utilities
│   ├── landing-page.ts    # Landing page renderer
│   ├── sse.ts             # Server-Sent Events utilities
│   └── index.ts           # Main exports
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

### Exports

- `http(options?)`: HTTP extension function
- `AgentHttpHandlers`: HTTP handlers type
- `HttpExtensionOptions`: Extension options type
- SSE utilities: `createSSEStream`, `writeSSE`, types

## Benefits

1. **Protocol-Agnostic Core**: Core runtime is no longer tied to HTTP, enabling future protocols (gRPC, WebSocket, etc.)
2. **Composability**: Extensions can be mixed and matched based on needs
3. **Type Safety**: TypeScript ensures extensions don't conflict and compose correctly
4. **Independence**: Extensions only depend on shared types, avoiding circular dependencies
5. **Testability**: Each extension can be tested in isolation
6. **Maintainability**: Clear separation of concerns with domain ownership
7. **Future-Proof**: Easy to add new extensions without modifying core

## Migration Guide

See the detailed migration guide in `.changeset/olive-bushes-see.md` for step-by-step instructions.
