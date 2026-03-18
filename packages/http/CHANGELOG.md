# @lucid-agents/http

## 1.10.2

### Patch Changes

- Updated dependencies [9ad5dc8]
  - @lucid-agents/types@1.7.0

## 1.10.1

### Patch Changes

- Updated dependencies [c1c53f9]
  - @lucid-agents/types@1.6.1

## 1.10.0

### Minor Changes

- 735dd34: Release packages that were missed in 2.4.0 release

  These packages were not included in the 2.4.0 release and are still depending on @lucid-agents/types@1.5.7. This release brings them up to date so they depend on types@1.6.0 with the CAIP-2 Network type, resolving potential type conflicts in dependency trees.

## 1.9.9

### Patch Changes

- Updated dependencies [735dd34]
  - @lucid-agents/types@1.6.0

## 1.9.8

### Patch Changes

- Updated dependencies [23a7254]
  - @lucid-agents/types@1.5.7

## 1.9.7

### Patch Changes

- Updated dependencies [0a8ad8f]
  - @lucid-agents/types@1.5.6

## 1.9.6

### Patch Changes

- Updated dependencies [5bafcef]
  - @lucid-agents/types@1.5.5

## 1.9.5

### Patch Changes

- 9abbd6a: Add Postgres storage backend, multi-agent support, and refine extension API structure

  ## New Features

  ### Postgres Storage Backend for Payments
  - Added `PostgresPaymentStorage` class for persistent payment storage
  - Supports connection pooling and automatic schema initialization
  - Ideal for serverless deployments and multi-instance setups
  - Docker Compose setup for local development
  - CI integration with Postgres test database

  ### Multi-Agent Support
  - Added optional `agentId` parameter to payments extension for multi-agent isolation
  - Multiple agents can now share the same Postgres database with complete payment isolation
  - Backward compatible - existing single-agent deployments continue to work unchanged
  - Database queries automatically filter by `agentId` when provided

  ### API Structure Refinements
  - Added `agentId` parameter to `payments()` extension factory
  - Added `storageFactory` parameter for custom storage implementations
  - Refined extension runtime types for stricter type safety:
    - `a2a()` extension now returns `{ a2a: A2ARuntime }` instead of optional
    - `analytics()` extension now returns `{ analytics: AnalyticsRuntime }` instead of direct runtime
    - `scheduler()` extension now returns `{ scheduler: SchedulerRuntime }` instead of optional
  - Moved `Network` type from `@lucid-agents/core` to `@lucid-agents/types/core` for better organization

  ## Migration

  No breaking changes. Existing code continues to work. To enable multi-agent support, pass `agentId` when creating the payments extension:

  ```typescript
  .use(payments({
    config: { /* ... */ },
    agentId: 'my-agent-id' // Optional, for multi-agent isolation
  }))
  ```

- Updated dependencies [9abbd6a]
  - @lucid-agents/types@1.5.4

## 1.9.4

### Patch Changes

- 8b1afb7: Fix circular dependencies and inline type imports
  - **HTTP package**: Removed circular dependencies on `@lucid-agents/core` and `@lucid-agents/payments` by exposing `resolvePrice` on PaymentsRuntime instead of importing from payments package
  - **Payments package**: Added `resolvePrice` method to PaymentsRuntime for use by extensions
  - **Types package**: Fixed inline type imports within types package (payments, a2a) and added `resolvePrice` to PaymentsRuntime type
  - **Identity package**: Fixed inline type import for TrustConfig
  - **All packages**: Converted unnecessary dynamic imports to static imports in tests, templates, and examples

  These changes improve code quality and eliminate circular dependencies while maintaining backward compatibility.

- Updated dependencies [8b1afb7]
  - @lucid-agents/types@1.5.3

## 1.9.3

### Patch Changes

- Updated dependencies [222485f]
  - @lucid-agents/payments@1.10.0
  - @lucid-agents/types@1.5.2
  - @lucid-agents/core@1.10.0

## 1.9.2

### Patch Changes

- Updated dependencies [2e95dcf]
  - @lucid-agents/payments@1.9.2
  - @lucid-agents/types@1.5.1
  - @lucid-agents/core@1.9.2

## 1.9.1

### Patch Changes

- @lucid-agents/core@1.9.1
- @lucid-agents/payments@1.9.1

## 1.9.0

### Minor Changes

- 1ffbd1d: Deprecate global config, cleanup types, improve A2A discovery, and add examples package

  ## Summary

  Deprecates global configuration in favor of explicit instance-based configuration passed directly to extensions via `.use()` method. Reorganizes types into domain-specific sub-packages. Enhances A2A agent discovery with multiple URL fallback, capability helpers, and missing spec fields. Adds new `@lucid-agents/examples` package for comprehensive type checking and developer experience validation.

  ## Breaking Changes

  ### Configuration API

  **Deprecated:** Global configuration pattern with `build(configOverrides)`

  **New:** Configuration passed directly to extensions

  **Before:**

  ```typescript
  const runtime = await createAgent(meta)
    .use(http())
    .use(payments())
    .build(configOverrides); // Config passed separately
  ```

  **After:**

  ```typescript
  const runtime = await createAgent(meta)
    .use(http())
    .use(payments({ config: paymentsConfig })) // Config passed directly
    .build(); // No arguments
  ```

  ### Type Exports

  Types reorganized into domain-specific sub-packages. Import directly from `@lucid-agents/types/{domain}`:
  - `@lucid-agents/types/core` - Core runtime types
  - `@lucid-agents/types/http` - HTTP-related types
  - `@lucid-agents/types/payments` - Payment configuration types
  - `@lucid-agents/types/wallets` - Wallet types
  - `@lucid-agents/types/a2a` - A2A protocol types
  - `@lucid-agents/types/ap2` - AP2 extension types

  **Migration:**

  ```typescript
  // Before
  import { AgentRuntime } from '@lucid-agents/core';

  // After
  import type { AgentRuntime } from '@lucid-agents/types/core';
  ```

  ## Improvements
  - **New Examples Package (`@lucid-agents/examples`)**: Added comprehensive examples package that serves as critical infrastructure for maintaining developer experience quality
    - Provides continuous type checking to ensure developer-facing interfaces remain stable
    - Validates developer experience consistency when pushing SDK changes
    - Eliminates circular development dependencies by moving examples out of individual packages
    - Ensures all SDK packages work correctly together before releases
    - Marked as private package (not published to npm) for internal use
  - Better type inference for entrypoint handlers with Zod-aware generics
  - Reorganized HTTP/fetch typings for clearer server/client usage
  - Eliminated circular dependencies by moving shared types to `@lucid-agents/types`
  - Fixed build order based on actual runtime dependencies

  ## A2A Protocol Improvements

  ### Agent Discovery
  - **Multiple URL Fallback**: `fetchAgentCard()` now tries multiple well-known paths for better compatibility:
    - Base URL (if absolute)
    - `/.well-known/agent-card.json` (A2A spec recommended)
    - `/.well-known/agent.json` (alternative)
    - `/agentcard.json` (legacy)
  - **Capability Helpers**: Added helper functions for checking agent capabilities:
    - `hasCapability()` - Check if agent supports streaming, pushNotifications, etc.
    - `hasSkillTag()` - Check if agent has a specific skill tag
    - `supportsPayments()` - Check if agent supports payments
    - `hasTrustInfo()` - Check if agent has trust/identity information
  - **Simplified API**: Removed redundant functions:
    - Removed `fetchAgentCapabilities()` (was just `fetchAgentCard()` minus entrypoints)
    - Removed `discoverAgentCard()` (was just an alias for `fetchAgentCard()`)
    - All discovery functions consolidated in `card.ts`

  ### Type Improvements
  - **Clear Separation**:
    - `fetchAgentCard()` returns `AgentCard` (capabilities only, no entrypoints)
    - `buildAgentCard()` returns `AgentCardWithEntrypoints` (for our own manifest)
    - Entrypoints are only needed when building our own agent's card
  - **Client Methods**: All client methods (`invoke`, `stream`, `sendMessage`, etc.) now accept `AgentCard` instead of `AgentCardWithEntrypoints`
    - They only need skill ID and URL, not entrypoint schemas

  ### A2A Spec Compliance
  - **Added Missing Fields**:
    - `protocolVersion` (default: "1.0")
    - `supportedInterfaces` (replaces deprecated `url` field)
    - `documentationUrl`
    - `securitySchemes` (map)
    - `security` (array)
    - `signatures` (JWS for verification)
    - `iconUrl`
    - `security` in `AgentSkill` (per-skill security)
  - **Updated `buildAgentCard()`**: Now includes `protocolVersion` and `supportedInterfaces`

  ### Example Updates
  - Updated A2A example to demonstrate real-world discovery flow:
    1. Fetch agent card from URL
    2. Check capabilities
    3. Discover skills by tags
    4. Find and call a skill

  ## Bug Fixes
  - Fixed incorrect `https://` protocol in Bun server log messages (changed to `http://`)
  - Fixed `facilitatorUrl` type mismatch in payments configuration (now uses proper `Resource` type with URL validation)
  - Fixed `RegistrationEntry` type in tests (added missing `agentAddress` field)

### Patch Changes

- Updated dependencies [1ffbd1d]
  - @lucid-agents/core@1.9.0
  - @lucid-agents/types@1.5.0
  - @lucid-agents/payments@1.9.0

## 1.8.0

### Minor Changes

- 2ce3a85: Refactor to protocol-agnostic extension-based architecture with HTTP as separate package

  **Breaking Changes:**
  - **Extension-based API**: Removed `createAgentRuntime()` and `createAgentHttpRuntime()` - replaced with extension-based API using `createAgent().use().build()`
  - **HTTP as separate package**: HTTP extension moved to separate `@lucid-agents/http` package
  - **Protocol-agnostic core**: `AgentCore` no longer has `invoke()`, `stream()`, or `resolveManifest()` methods - these are HTTP-specific and moved to `@lucid-agents/http`
  - **AgentContext is protocol-agnostic**: Removed `headers: Headers` property, replaced with `metadata?: Record<string, unknown>` (HTTP extension adds headers to metadata)
  - **ZodValidationError moved**: Moved from `@lucid-agents/core` to `@lucid-agents/types/core`
  - **Removed utilities**: Removed `toJsonSchemaOrUndefined()` - inline `z.toJSONSchema()` directly where needed
  - **Removed types**: Removed `InvokeContext`, `StreamContext`, and `InvokeResult` from `@lucid-agents/core` - these are HTTP-specific and now in `@lucid-agents/http`
  - **All adapters**: Now use `createAgent().use(http()).build()` pattern and require HTTP extension
  - **Identity package**: `createAgentIdentity()` now requires `runtime: AgentRuntime` parameter (breaking change) - must have `runtime.wallets.agent` configured
  - **TanStack package**: Removed `SolanaChainAddress` type alias - use `SolanaAddress` from `@lucid-agents/types/payments` directly instead

  **New API:**

  ```typescript
  import { createAgent } from '@lucid-agents/core';
  import { http } from '@lucid-agents/http';
  import { wallets, walletsFromEnv } from '@lucid-agents/wallet';
  import { identity, identityFromEnv } from '@lucid-agents/identity';
  import { payments } from '@lucid-agents/payments';
  import { a2a } from '@lucid-agents/a2a';

  // Option 1: Automatic identity creation via extension (recommended)
  // The identity extension's onBuild hook automatically creates identity if config is provided
  const agent = await createAgent(meta)
    .use(http())
    .use(wallets({ config: walletsFromEnv() }))
    .use(identity({ config: identityFromEnv() })) // Auto-creates identity during build
    .use(payments({ config }))
    .use(a2a())
    .build(); // All async onBuild hooks (including identity creation) are automatically awaited

  // Option 2: Manual identity creation after build
  const agent = await createAgent(meta)
    .use(http())
    .use(wallets({ config: walletsFromEnv() }))
    .use(identity()) // Extension without auto-create
    .build();

  const identity = await createAgentIdentity({
    runtime: agent, // Now requires runtime parameter
    domain: process.env.AGENT_DOMAIN,
    autoRegister: true,
  });
  ```

  **Migration Guide:**
  1. **Replace app creation:**
     - Old: `createAgentRuntime(meta, options)`
     - New: `await createAgent(meta).use(extensions).build()`
  2. **Replace HTTP runtime:**
     - Old: `createAgentHttpRuntime(meta, options)`
     - New: `await createAgent(meta).use(http()).build()`
  3. **Update imports:**
     - Import `http` from `@lucid-agents/http` instead of `@lucid-agents/core`
     - Import `ZodValidationError` from `@lucid-agents/types/core` instead of `@lucid-agents/core`
     - Import `InvokeResult` from `@lucid-agents/http` instead of `@lucid-agents/core` (if needed)
  4. **Update AgentContext usage:**
     - Old: `ctx.headers.get('authorization')`
     - New: `(ctx.metadata?.headers as Headers)?.get('authorization')` or `ctx.metadata?.headers` (HTTP extension provides this)
  5. **Update manifest building:**
     - Old: `agent.resolveManifest(origin, basePath)`
     - New: `agent.manifest.build(origin)`
  6. **Remove core invoke/stream calls:**
     - Old: `agent.invoke(key, input, ctx)`
     - New: Use HTTP handlers (via `runtime.handlers.invoke`) or import `invokeHandler` from `@lucid-agents/http` for direct calls:

     ```typescript
     import { invokeHandler } from '@lucid-agents/http';

     const entrypoint = agent.agent.getEntrypoint(key);
     if (!entrypoint) {
       throw new Error(`Entrypoint "${key}" not found`);
     }

     const result = await invokeHandler(entrypoint, input, {
       signal: ctx.signal,
       headers: ctx.headers,
       runId: ctx.runId,
       runtime: agent,
     });
     ```

  7. **Update identity usage:**
     - Old: `createAgentIdentity({ domain, autoRegister })` (standalone, no runtime required)
     - New: `createAgentIdentity({ runtime: agent, domain, autoRegister })` (requires runtime parameter)
     - **Recommended**: Use automatic mode with `identity({ config: identityFromEnv() })` in extension chain
     - New helper: `identityFromEnv()` loads config from `AGENT_DOMAIN`, `RPC_URL`, `CHAIN_ID`, `REGISTER_IDENTITY` env vars
  8. **Update TanStack SolanaAddress import:**
     - Old: `import type { SolanaChainAddress } from '@lucid-agents/tanstack';`
     - New: `import type { SolanaAddress } from '@lucid-agents/types/payments';` (or re-export from `@lucid-agents/tanstack` as `SolanaAddress`)
  9. **Update CLI templates and examples** to use new extension API

### Patch Changes

- Updated dependencies [2ce3a85]
  - @lucid-agents/core@1.8.0
  - @lucid-agents/types@1.4.0
  - @lucid-agents/payments@1.8.0
