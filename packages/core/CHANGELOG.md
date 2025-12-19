# @lucid-agents/core

## 1.12.2

### Patch Changes

- Updated dependencies [0a8ad8f]
  - @lucid-agents/types@1.5.6
  - @lucid-agents/a2a@0.5.4
  - @lucid-agents/payments@1.12.2

## 1.12.1

### Patch Changes

- Updated dependencies [5bafcef]
  - @lucid-agents/types@1.5.5
  - @lucid-agents/a2a@0.5.3
  - @lucid-agents/payments@1.12.1

## 1.12.0

### Patch Changes

- @lucid-agents/payments@1.12.0
- @lucid-agents/a2a@0.5.2

## 1.11.0

### Patch Changes

- Updated dependencies [03d5279]
  - @lucid-agents/payments@1.11.0
  - @lucid-agents/a2a@0.5.2

## 1.10.3

### Patch Changes

- Updated dependencies [70d804e]
  - @lucid-agents/payments@1.10.3
  - @lucid-agents/a2a@0.5.2

## 1.10.2

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
  - @lucid-agents/payments@1.10.2
  - @lucid-agents/types@1.5.4
  - @lucid-agents/a2a@0.5.2

## 1.10.1

### Patch Changes

- Updated dependencies [8b1afb7]
  - @lucid-agents/payments@1.10.1
  - @lucid-agents/types@1.5.3
  - @lucid-agents/identity@1.10.1
  - @lucid-agents/a2a@0.5.1
  - @lucid-agents/ap2@0.3.4
  - @lucid-agents/wallet@0.5.3

## 1.10.0

### Patch Changes

- Updated dependencies [222485f]
  - @lucid-agents/payments@1.10.0
  - @lucid-agents/a2a@0.5.0
  - @lucid-agents/types@1.5.2
  - @lucid-agents/ap2@0.3.3
  - @lucid-agents/identity@1.10.0
  - @lucid-agents/wallet@0.5.2

## 1.9.2

### Patch Changes

- Updated dependencies [2e95dcf]
  - @lucid-agents/payments@1.9.2
  - @lucid-agents/types@1.5.1
  - @lucid-agents/a2a@0.4.1
  - @lucid-agents/ap2@0.3.2
  - @lucid-agents/identity@1.9.2
  - @lucid-agents/wallet@0.5.1

## 1.9.1

### Patch Changes

- Updated dependencies [026ec23]
  - @lucid-agents/wallet@0.5.0
  - @lucid-agents/identity@1.9.1
  - @lucid-agents/a2a@0.4.0
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
  - @lucid-agents/types@1.5.0
  - @lucid-agents/payments@1.9.0
  - @lucid-agents/wallet@0.4.0
  - @lucid-agents/identity@1.9.0
  - @lucid-agents/a2a@0.4.0
  - @lucid-agents/ap2@0.3.1

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
  - @lucid-agents/types@1.4.0
  - @lucid-agents/a2a@0.3.0
  - @lucid-agents/ap2@0.3.0
  - @lucid-agents/identity@1.8.0
  - @lucid-agents/payments@1.8.0
  - @lucid-agents/wallet@0.3.0

## 1.7.0

### Minor Changes

- ae09320: # Agent-to-Agent (A2A) Client Support and Agent Card Refactoring

  Implements bidirectional A2A communication, refactors Agent Card generation to immutable composition pattern, separates AP2 into its own extension package, and demonstrates the 'facilitating agent pattern' where agents act simultaneously as clients and servers to facilitate agentic supply chain actions, e.g a trading signal agent buys data from a trading data agent, serves signals to a trading portfolio manager agent.

  ## New Features

  ### A2A Protocol Task-Based Operations

  Implements A2A Protocol task-based operations alongside existing direct invocation. Tasks enable long-running operations, status tracking, and multi-turn conversations.

  **New HTTP Endpoints:**
  - `POST /tasks` - Create task (returns `{ taskId, status: 'running' }` immediately)
  - `GET /tasks` - List tasks with filtering (contextId, status, pagination)
  - `GET /tasks/{taskId}` - Get task status and result
  - `POST /tasks/{taskId}/cancel` - Cancel a running task
  - `GET /tasks/{taskId}/subscribe` - SSE stream for task updates

  **New A2A Client Methods:**
  - `sendMessage(card, skillId, input, fetch?, options?)` - Creates task and returns taskId immediately (supports contextId for multi-turn conversations)
  - `getTask(card, taskId)` - Retrieves task status and result
  - `listTasks(card, filters?)` - Lists tasks with optional filtering by contextId, status, and pagination
  - `cancelTask(card, taskId)` - Cancels a running task
  - `subscribeTask(card, taskId, emit)` - Subscribes to task updates via SSE
  - `fetchAndSendMessage(baseUrl, skillId, input)` - Convenience: fetch card + send message
  - `waitForTask(client, card, taskId)` - Utility to poll for task completion

  **Task Lifecycle:**
  1. Client creates task via `POST /tasks` → receives `{ taskId, status: 'running' }`
  2. Task executes asynchronously (handler runs in background)
  3. Task status updates automatically: `running` → `completed`/`failed`/`cancelled`
  4. Client polls `GET /tasks/{taskId}` or subscribes via SSE for updates
  5. When complete, task contains `result: { output, usage, model }` or `error: { code, message }`

  **Multi-Turn Conversations:**
  - Tasks support `contextId` parameter for grouping related tasks in a conversation
  - Use `listTasks(card, { contextId })` to retrieve all tasks in a conversation
  - Enables building conversational agents that maintain context across multiple interactions

  **Task Management:**
  - `listTasks()` supports filtering by `contextId`, `status` (single or array), and pagination (`limit`, `offset`)
  - `cancelTask()` allows cancelling running tasks, updating status to `cancelled` and aborting handler execution
  - Tasks include `AbortController` for proper cancellation handling

  **Backward Compatible:**
  - Direct invocation (`/entrypoints/{key}/invoke`) remains fully supported
  - Existing code using `client.invoke()` continues to work
  - Both approaches can be used side-by-side

  **Task Storage:**
  - In-memory `Map<taskId, TaskEntry>` in core runtime (combines Task and AbortController)
  - Tasks persist for agent lifetime (no automatic expiration)
  - Each task entry includes task data and AbortController for cancellation support

  **Adapters:**
  - Hono: Task routes registered automatically
  - TanStack (headless & ui): Task route files created

  ### A2A Client Support (`@lucid-agents/a2a`)
  - **New `@lucid-agents/a2a` package** - Complete A2A protocol implementation
  - **Agent Card Building** - `buildAgentCard()` creates base A2A-compliant Agent Cards
  - **Agent Card Fetching** - `fetchAgentCard()` retrieves Agent Cards from `/.well-known/agent-card.json`
  - **Client Utilities** - `invokeAgent()`, `streamAgent()`, and `fetchAndInvoke()` for calling other agents
  - **Payment-Enabled Calls** - A2A client supports payment-enabled `fetch` for paid agent interactions
  - **A2A Runtime** - `createA2ARuntime()` integrates A2A capabilities into agent runtime
  - **Skill Discovery** - `findSkill()` and `parseAgentCard()` utilities for working with Agent Cards

  ### AP2 Extension Package (`@lucid-agents/ap2`)
  - **New `@lucid-agents/ap2` package** - Separated AP2 (Agent Payments Protocol) into its own extension
  - **AP2 Runtime** - `createAP2Runtime()` for managing AP2 configuration
  - **Agent Card Enhancement** - `createAgentCardWithAP2()` adds AP2 extension metadata to Agent Cards
  - **Auto-enablement** - Automatically enables merchant role when payments are configured

  ### Agent Card Immutable Composition
  - **Immutable Enhancement Functions** - `createAgentCardWithPayments()`, `createAgentCardWithIdentity()`, `createAgentCardWithAP2()`
  - **Composition Pattern** - Agent Cards are built by composing base A2A card with protocol-specific enhancements
  - **Separation of Concerns** - Each protocol (A2A, payments, identity, AP2) owns its Agent Card metadata

  ### Runtime Access in Handlers
  - **Runtime Context** - `AgentContext` now includes `runtime` property for accessing A2A client, payments, wallets, etc.
  - **A2A Client Access** - Handlers can call other agents via `ctx.runtime?.a2a?.client.invoke()`

  ### Trading Agent Templates (`@lucid-agents/cli`)
  - **New `trading-data-agent` template** - Merchant agent providing mock trading data
  - **New `trading-recommendation-agent` template** - Shopper agent that buys data and provides trading signals
  - **A2A Composition Example** - Demonstrates agent-to-agent communication with payments

  ### Type System Improvements (`@lucid-agents/types`)
  - **A2A Types** - New `@lucid-agents/types/a2a` sub-package with A2A-specific types
  - **AP2 Types** - New `@lucid-agents/types/ap2` sub-package with AP2-specific types
  - **Shared FetchFunction** - `FetchFunction` type moved to `@lucid-agents/types/core` for cross-package use

  ### Build System Standardization
  - **Standardized `tsconfig.build.json`** - All packages now use build-specific TypeScript configuration
  - **Fixed Build Order** - Added `@lucid-agents/a2a` and `@lucid-agents/ap2` to build sequence
  - **External Dependencies** - All workspace dependencies properly marked as external in tsup configs

  ## Facilitating Agent Example

  **New Example: `packages/a2a/examples/full-integration.ts`** demonstrates the **facilitating agent pattern**, a core A2A use case where an agent acts as both client and server.

  The example shows a three-agent composition:
  - **Agent 1 (Worker)**: Does the actual work (echo, process, stream)
  - **Agent 2 (Facilitator)**: Acts as both server and client
    - **Server**: Receives calls from Agent 3
    - **Client**: Calls Agent 1 to perform work, then returns results
  - **Agent 3 (Client)**: Initiates requests

  **Flow:** Agent 3 → Agent 2 → Agent 1 → Agent 2 → Agent 3

  This demonstrates that agents can orchestrate other agents, enabling complex agent compositions and supply chains. The facilitating agent pattern is essential for building agent ecosystems where agents work together to accomplish tasks.

  The example demonstrates:
  - Task-based operations (sendMessage, waitForTask)
  - Multi-turn conversations with contextId tracking
  - Listing tasks filtered by contextId
  - Task cancellation with proper error handling
  - Agent composition via tasks (agent calling agent calling agent)

  Run the example: `bun run examples/full-integration.ts` (from `packages/a2a`)

  ## Breaking Changes

  ### Removed `buildManifest()` Function

  **BREAKING:** The `buildManifest()` function has been completely removed. This is a clean break - no deprecation period.

  **Before:**

  ```typescript
  import { buildManifest } from '@lucid-agents/core';

  const manifest = buildManifest({
    meta,
    registry,
    origin: 'https://agent.example',
    payments,
    trust,
  });
  ```

  **After:**

  ```typescript
  // Use runtime.manifest.build() instead
  const card = runtime.manifest.build(origin);

  // Or use enhancement functions directly
  let card = a2a.buildCard(origin);
  if (payments?.config) {
    card = createAgentCardWithPayments(card, payments.config, entrypoints);
  }
  if (trust) {
    card = createAgentCardWithIdentity(card, trust);
  }
  if (ap2Config) {
    card = createAgentCardWithAP2(card, ap2Config);
  }
  ```

  ### Type Import Changes

  **Before:**

  ```typescript
  import { InvokeAgentResult, StreamEmit } from '@lucid-agents/core';
  ```

  **After:**

  ```typescript
  import type { InvokeAgentResult, StreamEmit } from '@lucid-agents/types/a2a';
  ```

  ### Removed Re-exports

  All re-exports have been removed from package `index.ts` files. Import directly from source packages:
  - A2A utilities: `@lucid-agents/a2a`
  - AP2 utilities: `@lucid-agents/ap2`
  - Types: `@lucid-agents/types/*`

  ## Migration Guide
  1. **Replace `buildManifest()` calls** - Use `runtime.manifest.build()` or compose enhancement functions
  2. **Update type imports** - Import A2A types from `@lucid-agents/types/a2a` instead of `@lucid-agents/core`
  3. **Use A2A client** - Access via `ctx.runtime?.a2a?.client` in handlers
  4. **Import AP2 utilities** - Import `AP2_EXTENSION_URI` from `@lucid-agents/ap2` instead of `@lucid-agents/core`

### Patch Changes

- Updated dependencies [ae09320]
  - @lucid-agents/a2a@0.2.0
  - @lucid-agents/ap2@0.2.0
  - @lucid-agents/identity@1.7.0
  - @lucid-agents/payments@1.7.0
  - @lucid-agents/types@1.3.0
  - @lucid-agents/wallet@0.2.1

## 1.6.0

### Minor Changes

- 28475b2: # Wallets SDK and Type System Refactoring

  Introduces comprehensive wallet SDK, refactors type system to eliminate circular dependencies, improves build system, and adds extensive code quality improvements. This prepares the foundation for bidirectional agent-to-agent (A2A) communication.

  ## New Features

  ### Wallet Package (`@lucid-agents/wallet`)
  - New `@lucid-agents/wallet` package providing wallet connectors and signing infrastructure
  - **Local Wallet Connector** (`LocalEoaWalletConnector`) - Supports private key-based signing, message signing, typed data signing (EIP-712), and transaction signing for contract interactions
  - **Server Orchestrator Wallet Connector** (`ServerOrchestratorWalletConnector`) - Remote wallet signing via server orchestrator API with bearer token authentication
  - **Wallet Factory** (`createAgentWallet`) - Unified API for creating wallet handles supporting both local and server-backed wallets
  - **Environment-based Configuration** - `walletsFromEnv()` for loading wallet configuration from environment variables
  - **Private Key Signer** (`createPrivateKeySigner`) - Wraps viem's `privateKeyToAccount` for consistent interface with full support for message, typed data, and transaction signing

  ### Type System Consolidation
  - Consolidated all shared types into `@lucid-agents/types` package
  - Organized types by domain: `core/`, `payments/`, `wallets/`, `identity/`
  - Moved types from individual packages (`core`, `wallet`, `payments`, `identity`) to shared types package
  - Eliminated circular dependencies between `core`, `payments`, and `identity`
  - Fixed build order based on actual runtime dependencies

  ## Breaking Changes

  ### Configuration Shape

  Changed from `wallet` to `wallets` with nested `agent` and `developer` entries:

  ```typescript
  // Before
  { wallet: { type: 'local', privateKey: '0x...' } }

  // After
  { wallets: { agent: { type: 'local', privateKey: '0x...' }, developer: { ... } } }
  ```

  ### Type Exports

  Types from `@lucid-agents/types` are no longer re-exported from individual packages. Import directly:

  ```typescript
  // Before
  import { AgentRuntime } from '@lucid-agents/core';

  // After
  import type { AgentRuntime } from '@lucid-agents/types/core';
  ```

  ### TypedDataPayload API

  Changed from snake_case to camelCase to align with viem:

  ```typescript
  // Before
  { primary_type: 'Mail', typed_data: { ... } }

  // After
  { primaryType: 'Mail', typedData: { ... } }
  ```

  ### ChallengeSigner Interface

  Made `payload` and `scopes` optional to match `AgentChallenge`:

  ```typescript
  // Before
  signChallenge(challenge: { payload: unknown; scopes: string[]; ... })

  // After
  signChallenge(challenge: { payload?: unknown; scopes?: string[]; ... })
  ```

  ## Improvements

  ### Architecture & Build System
  - **Eliminated Circular Dependencies** - Moved all shared types to `@lucid-agents/types` package, removed runtime dependencies between `core`, `payments`, and `identity`
  - **Fixed Build Order** - Corrected topological sort: `types` → `wallet` → `payments` → `identity` → `core` → adapters
  - **Added Build Commands** - `build:clean` command and `just build-all-clean` for fresh builds
  - **AP2 Constants** - `AP2_EXTENSION_URI` kept in core (runtime constant), type uses string literal to avoid type-only import issues

  ### Code Quality
  - **Removed `stableJsonStringify`** - Completely removed complex stringification logic, simplified challenge message resolution
  - **Removed `ChallengeNormalizationOptions`** - Removed unused interface, simplified `normalizeChallenge()` signature
  - **Import/Export Cleanup** - Removed `.js` extensions from TypeScript source imports, removed unnecessary type re-exports
  - **Type Safety** - Fixed `signTransaction` support for local wallets, aligned `TypedDataPayload` with viem types, removed unsafe type assertions
  - **Payments Runtime Simplification** - Removed `PaymentsRuntimeInternal` type split, unified to single `PaymentsRuntime` type with all methods (`config`, `isActive`, `requirements`, `activate`). Payments package now returns complete runtime directly, core runtime exposes payments directly without wrapping (consistent with wallets pattern)
  - **DRY Improvements** - Extracted `resolveRequiredChainId()` helper in identity package to eliminate duplication between bootstrap and registry client creation
  - **Code Structure Principles** - Added comprehensive code structure principles section to `AGENTS.md` covering single source of truth, encapsulation at right level, direct exposure, consistency, public API clarity, simplicity over indirection, domain ownership, and no premature abstraction

  ### Type System

  **Comprehensive Type Moves:**
  - **From `@lucid-agents/core` to `@lucid-agents/types/core`**: `AgentRuntime`, `AgentCard`, `AgentCardWithEntrypoints`, `Manifest`, `PaymentMethod`, `AgentCapabilities`, `AP2Config`, `AP2Role`, `AP2ExtensionDescriptor`, `AP2ExtensionParams`, `AgentMeta`, `AgentContext`, `Usage`, `EntrypointDef`, `AgentKitConfig`
  - **From `@lucid-agents/wallet` to `@lucid-agents/types/wallets`**: `WalletConnector`, `ChallengeSigner`, `WalletMetadata`, `LocalEoaSigner`, `TypedDataPayload`, `AgentChallenge`, `AgentChallengeResponse`, `AgentWalletHandle`, `AgentWalletKind`, `AgentWalletConfig`, `DeveloperWalletConfig`, `WalletsConfig`, `LocalWalletOptions`, and related types
  - **From `@lucid-agents/payments` to `@lucid-agents/types/payments`**: `PaymentRequirement`, `RuntimePaymentRequirement`, `PaymentsConfig`, `EntrypointPrice`, `SolanaAddress`, `PaymentsRuntime` (now includes `activate` method in public API)
  - **From `@lucid-agents/identity` to `@lucid-agents/types/identity`**: `TrustConfig`, `RegistrationEntry`, `TrustModel`

  **Type Alignment:**
  - `TypedDataPayload`: Changed `primary_type` → `primaryType`, `typed_data` → `typedData` (camelCase to match viem)
  - `ChallengeSigner`: Made `payload` and `scopes` optional to match `AgentChallenge`
  - `LocalEoaSigner`: Added `signTransaction` method for contract writes
  - `AP2ExtensionDescriptor`: Uses string literal instead of `typeof AP2_EXTENSION_URI`

  ## Bug Fixes
  - Fixed circular dependency between `core` and `payments`/`identity`
  - Fixed build order causing build failures
  - Fixed transaction signing for local wallets (enables identity registration)
  - Fixed `TypedDataPayload` alignment with viem (camelCase, removed type assertions)
  - Fixed challenge message resolution (no longer signs empty/null values)
  - Fixed type inconsistencies between `ChallengeSigner` and `AgentChallenge`
  - Fixed payments runtime type split (removed `PaymentsRuntimeInternal`, unified to single type)
  - Fixed payments runtime wrapping (removed unnecessary wrapping in core runtime)
  - Fixed duplicated chainId resolution logic (extracted `resolveRequiredChainId` helper)

  ## Migration Guide

  See PR description for detailed migration steps covering:
  1. Configuration shape changes (`wallet` → `wallets`)
  2. Type import updates (direct imports from `@lucid-agents/types`)
  3. TypedData API changes (snake_case → camelCase)
  4. Wallet package usage

### Patch Changes

- Updated dependencies [28475b2]
  - @lucid-agents/wallet@0.2.0
  - @lucid-agents/types@1.2.0
  - @lucid-agents/payments@1.6.0
  - @lucid-agents/identity@1.6.0

## 1.5.2

### Patch Changes

- c1f12dd: # Express Adapter Support

  Adds first-class Express adapter with x402 payments, scaffolding templates, and comprehensive documentation.

  ## New Features

  ### Express Adapter Package
  - New `@lucid-agents/express` package with full Express integration
  - x402-express paywalling middleware for monetized endpoints
  - Request/response bridges for Express to agent runtime
  - Comprehensive smoke tests validating Express adapter functionality

  ### CLI Integration
  - Express adapter available via `--adapter=express` flag
  - Scaffolding assets and template support for Express projects
  - Interactive adapter selection includes Express option
  - Example: `bunx @lucid-agents/cli my-agent --adapter=express --template=blank`

  ### Documentation
  - Updated CLI README with Express adapter examples
  - Added Express adapter documentation to core package README
  - Express-specific setup guides and configuration examples
  - Clarified adapter selection in CLI documentation

  ## Improvements

  ### AxLLM Client Configuration
  - Stop enabling streaming by default in `createAxLLMClient`
  - Generated AxLLM clients now only opt into streaming when explicitly requested via overrides
  - More predictable behavior for non-streaming use cases

  ### Build Configuration
  - Added `@lucid-agents/express` to build order in `scripts/build-packages.ts`
  - Proper TypeScript configuration for express package
  - Consistent tsup configuration with other adapters

  ## Backward Compatibility

  This change adds new functionality without breaking existing adapters. Projects using Hono, TanStack, or Next.js adapters are unaffected.
  - @lucid-agents/identity@1.5.2
  - @lucid-agents/payments@1.5.2

## 1.5.1

### Patch Changes

- 2428d81: **BREAKING**: Remove `useConfigPayments` and `defaultPrice` - fully explicit payment configuration

  Two breaking changes for clearer, more explicit payment handling:
  1. **Removed `useConfigPayments` option** - No more automatic payment application
  2. **Removed `defaultPrice` from PaymentsConfig** - Each paid entrypoint must specify its own price

  **Migration:**

  Before:

  ```typescript
  createAgentApp(meta, {
    config: {
      payments: {
        facilitatorUrl: '...',
        payTo: '0x...',
        network: 'base-sepolia',
        defaultPrice: '1000', //  Removed
      }
    },
    useConfigPayments: true, //  Removed
  });

  addEntrypoint({
    key: 'analyze',
    // Inherited defaultPrice
    handler: ...
  });
  ```

  After:

  ```typescript
  const DEFAULT_PRICE = '1000'; // Optional: define your own constant

  createAgentApp(meta, {
    payments: {
      facilitatorUrl: '...',
      payTo: '0x...',
      network: 'base-sepolia',
      //  No defaultPrice
    }
  });

  addEntrypoint({
    key: 'analyze',
    price: DEFAULT_PRICE, //  Explicit per entrypoint
    handler: ...
  });
  ```

  **Benefits:**
  - **Fully explicit**: Every paid entrypoint has a visible price
  - **No magic defaults**: What you see is what you get
  - **Simpler types**: `PaymentsConfig` only has essential fields
  - **Developer friendly**: Easy to define your own constants if needed

- Updated dependencies [2428d81]
  - @lucid-agents/types@1.1.1
  - @lucid-agents/payments@1.5.1
  - @lucid-agents/identity@1.5.1

## 1.5.0

### Minor Changes

- 8a3ed70: Simplify package names and introduce types package

  **Package Renames:**
  - `@lucid-agents/agent-kit` → `@lucid-agents/core`
  - `@lucid-agents/agent-kit-identity` → `@lucid-agents/identity`
  - `@lucid-agents/agent-kit-payments` → `@lucid-agents/payments`
  - `@lucid-agents/agent-kit-hono` → `@lucid-agents/hono`
  - `@lucid-agents/agent-kit-tanstack` → `@lucid-agents/tanstack`
  - `@lucid-agents/create-agent-kit` → `@lucid-agents/cli`

  **New Package:**
  - `@lucid-agents/types` - Shared type definitions with zero circular dependencies

  **Architecture Improvements:**
  - Zero circular dependencies (pure DAG via types package)
  - Explicit type contracts - all shared types in @lucid-agents/types
  - Better IDE support and type inference
  - Cleaner package naming without redundant "agent-kit" prefix
  - Standardized TypeScript configuration across all packages
  - Consistent type-checking for all published packages

  **Migration:**

  Update your imports:

  ```typescript
  // Before
  import { createAgentApp } from '@lucid-agents/agent-kit-hono';
  import type { EntrypointDef } from '@lucid-agents/agent-kit';
  import type { PaymentsConfig } from '@lucid-agents/agent-kit-payments';
  import { createAgentIdentity } from '@lucid-agents/agent-kit-identity';

  // After
  import { createAgentApp } from '@lucid-agents/hono';
  import type { EntrypointDef, PaymentsConfig } from '@lucid-agents/types';
  import { createAgentIdentity } from '@lucid-agents/identity';
  ```

  Update CLI usage:

  ```bash
  # Before
  bunx @lucid-agents/create-agent-kit my-agent

  # After
  bunx @lucid-agents/cli my-agent
  # or
  bunx create-agent-kit my-agent
  ```

  **TypeScript Configuration:**

  All published packages now:
  - Extend a shared base TypeScript configuration for consistency
  - Include `type-check` script for CI validation
  - Use simplified type-check command (`tsc -p tsconfig.json --noEmit`)

  **Note:** Old package names will be deprecated via npm after this release.

### Patch Changes

- Updated dependencies [8a3ed70]
  - @lucid-agents/types@1.1.0
  - @lucid-agents/identity@1.5.0
  - @lucid-agents/payments@1.5.0

## 1.4.2

### Patch Changes

- @lucid-agents/identity@1.4.2
- @lucid-agents/payments@1.1.2

## 1.4.1

### Patch Changes

- 71f9142: # Add Open Graph Tags for Agent Discoverability

  Implements GitHub issue [#37](https://github.com/daydreamsai/lucid-agents/issues/37).

  ## Summary

  Agent landing pages now include Open Graph meta tags for better social sharing and x402scan discovery. This enables agents to show rich preview cards when shared on social platforms and improves discoverability in agent directories.

  ## Changes

  ### Enhanced AgentMeta Type

  Added three optional fields to `AgentMeta` for Open Graph metadata:

  ```typescript
  export type AgentMeta = {
    name: string;
    version: string;
    description?: string;
    icon?: string;

    // New: Open Graph metadata
    image?: string; // Preview image URL (1200x630px recommended)
    url?: string; // Canonical URL (defaults to origin if not provided)
    type?: 'website' | 'article'; // OG type (defaults to 'website')
  };
  ```

  ### Landing Page Updates

  The landing page renderer (`src/ui/landing-page.ts`) now automatically includes Open Graph meta tags in the HTML `<head>`:

  ```html
  <meta property="og:title" content="${meta.name}" />
  <meta property="og:description" content="${meta.description}" />
  <meta property="og:image" content="${meta.image}" />
  <meta property="og:url" content="${meta.url || origin}" />
  <meta property="og:type" content="${meta.type || 'website'}" />
  ```

  ### Documentation Updates

  Added comprehensive documentation in `AGENTS.md` explaining:
  - How to use Open Graph fields
  - What they enable (x402scan discovery, social sharing)
  - Example usage
  - Rendered HTML output

  ## Usage

  ```typescript
  import { createAgentApp } from '@lucid-agents/hono';

  const { app } = createAgentApp({
    name: 'My AI Agent',
    version: '1.0.0',
    description: 'AI-powered image processing',
    image: 'https://my-agent.com/og-image.png',
    url: 'https://my-agent.com',
    type: 'website',
  });
  ```

  **Result when shared on social platforms:**

  ```
  ┌─────────────────────────────────┐
  │ [Image: og-image.png]           │
  │ My AI Agent                     │
  │ AI-powered image processing     │
  │ my-agent.com                    │
  └─────────────────────────────────┘
  ```

  ## Benefits

  ### 1. x402scan Discovery

  Agent directories can crawl your agent's landing page and extract rich metadata for display in searchable catalogs.

  ### 2. Social Sharing

  Links to your agent show professional preview cards on:
  - Twitter/X
  - Discord
  - Slack
  - LinkedIn
  - Any platform that supports Open Graph

  ### 3. Professional Appearance

  Makes your agent look polished and legitimate when shared or discovered.

  ## Backward Compatibility

  **Fully backward compatible**
  - All new fields are optional
  - Existing agents work without changes
  - Adapters automatically get new types through `AgentMeta` import

  ## Adapter Support

  Both Hono and TanStack adapters automatically support Open Graph tags because they:
  1. Import `AgentMeta` from `@lucid-agents/core`
  2. Pass the meta object through to `createAgentHttpRuntime`
  3. Use the landing page renderer which now includes OG tags

  No adapter-specific changes needed - it "just works" through TypeScript type sharing.

  ## Example Updated

  Updated `examples/agent-zero.ts` to demonstrate Open Graph usage:

  ```typescript
  const { app } = createAgentApp({
    name: 'Agent Zero Arcade',
    version: '1.0.0',
    description: 'A playful quiz agent...',
    image: 'https://agent-zero-arcade.example.com/og-image.png',
    url: 'https://agent-zero-arcade.example.com',
    type: 'website',
  });
  ```

  ## Notes
  - **Headless agents**: Agents with `landingPage: false` don't render OG tags since they don't serve HTML
  - **Default URL**: If `url` is not provided, it defaults to the agent's origin
  - **Image recommendations**: 1200x630px is the standard size for social previews
  - **All fields optional**: Agents can omit OG fields and still work perfectly
  - @lucid-agents/payments@1.1.1
  - @lucid-agents/identity@1.4.1

## 1.4.0

### Minor Changes

- 5e192fe: # Payment Logic Extraction and Next.js Adapter

  This release introduces the Next.js adapter for building full-stack agent applications, completes the extraction of all payment-related logic from `agent-kit` into `agent-kit-payments`, establishes correct package boundaries, and reorganizes types to be co-located with their features.

  ## New Features

  ### Next.js Adapter
  - **Full-stack React framework** - Build agent applications with Next.js App Router
  - **Client dashboard** - Interactive UI for testing entrypoints with AppKit wallet integration
  - **x402 payment middleware** - Server-side paywall using `x402-next` middleware
  - **SSR-compatible** - Server-Side Rendering support with proper cache management
  - **Multi-network wallet support** - EVM (Base, Ethereum) and Solana via AppKit/WalletConnect

  **Key files:**
  - `app/api/agent/*` - HTTP endpoints backed by agent runtime handlers
  - `proxy.ts` - x402 paywall middleware for payment enforcement
  - `components/dashboard.tsx` - Client dashboard for testing entrypoints
  - `lib/paywall.ts` - Dynamic route pricing configuration
  - `components/AppKitProvider.tsx` - Wallet connection provider

  **Usage:**

  ```bash
  bunx @lucid-agents/cli my-agent --adapter=next
  ```

  **Features:**
  - Interactive entrypoint testing with form validation
  - Real-time SSE streaming support
  - Wallet connection with AppKit (EVM + Solana)
  - Payment flow testing with x402 protocol
  - Manifest and health endpoint viewing
  - Code snippet generation for API calls

  ## Breaking Changes

  ### Dependency Structure Clarified
  - Extensions (`agent-kit-identity`, `agent-kit-payments`) are now independent of each other
  - `agent-kit` depends on both extensions
  - `agent-kit-payments` imports `EntrypointDef` from `agent-kit`
  - Build order: identity → payments → agent-kit → adapters

  ### Type Locations Changed
  - `EntrypointDef` moved to `agent-kit/src/http/types.ts` - co-located with HTTP types
  - Stream types moved to `http/types.ts` - co-located with HTTP/SSE functionality
  - Deleted `agent-kit/src/types.ts` - types now co-located with features
  - Core types (`AgentMeta`, `AgentContext`, `Usage`) remain in `core/types.ts`
  - Crypto utilities (`sanitizeAddress`, `ZERO_ADDRESS`) added to `crypto/address.ts`

  ### Import Path Changes

  **Before:**

  ```typescript
  import type { EntrypointDef } from '@lucid-agents/core';
  ```

  **After (unchanged):**

  ```typescript
  import type { EntrypointDef } from '@lucid-agents/core';
  ```

  **For payment types:**

  ```typescript
  import type { PaymentsConfig } from '@lucid-agents/payments';
  ```

  ## Architectural Changes

  ### Files Deleted from agent-kit
  - `src/types.ts` - Central types file deleted; types now co-located with features
  - `src/http/payments.ts` - Payment requirement logic moved to agent-kit-payments
  - `src/runtime.ts` - Runtime payment context moved to agent-kit-payments
  - `src/utils/axllm.ts` - Moved to `src/axllm/index.ts`

  ### Package Boundaries Clarified

  **agent-kit-payments** contains ALL x402 protocol code:
  - Payment configuration types
  - Payment requirement resolution
  - 402 response generation
  - x402 client utilities (making payments)
  - Runtime payment context (wallet integration)
  - AxLLM integration with x402

  **agent-kit** contains:
  - Core types (AgentMeta, AgentContext, Usage)
  - HTTP types (EntrypointDef, StreamEnvelope, etc.)
  - Core runtime (AgentCore, handlers)
  - HTTP runtime and SSE streaming
  - Manifest generation
  - Config management
  - UI landing page
  - Crypto utilities (sanitizeAddress)

  ### AxLLM Reorganization
  - Moved from `src/utils/axllm.ts` to `src/axllm/index.ts`
  - Rationale: Isolated for future extraction into separate package
  - Updated package.json exports: `./axllm` instead of `./utils/axllm`

  ## Migration Guide

  ### For Package Consumers

  `EntrypointDef` remains in `agent-kit`, so existing imports continue to work:

  ```typescript
  // EntrypointDef stays in agent-kit
  import type { EntrypointDef } from '@lucid-agents/core';

  // Payment configuration from agent-kit-payments
  import type { PaymentsConfig } from '@lucid-agents/payments';
  ```

  ### For Package Contributors
  - Types are now co-located with features (no central types file)
  - Payment logic belongs in `agent-kit-payments`
  - agent-kit-payments must build before agent-kit

  ## Bug Fixes

  ### Type Inference for Entrypoint Handlers

  **Fixed:** `addEntrypoint()` now properly infers input/output types from Zod schemas.

  **Before:**

  ```typescript
  addEntrypoint({
    input: z.object({ message: z.string() }),
    handler: async ({ input }) => {
      // Bug: input has type 'unknown' even with schema
      const msg = input.message; // ❌ Type error
    },
  });
  ```

  **After:**

  ```typescript
  addEntrypoint({
    input: z.object({ message: z.string() }),
    handler: async ({ input }) => {
      // Fixed: input has type { message: string }
      const msg = input.message; // ✅ Works!
    },
  });
  ```

### Patch Changes

- Updated dependencies [5e192fe]
  - @lucid-agents/payments@1.1.0
  - @lucid-agents/identity@1.4.0

## 1.3.1

### Patch Changes

- 574e9b0: # Solana Payment Network Support

  This release adds comprehensive support for Solana payment networks across all adapters and templates.

  ## New Features

  ### Solana Network Support
  - **Solana Mainnet** (`solana`) and **Solana Devnet** (`solana-devnet`) are now fully supported for payment receiving
  - Both Hono and TanStack adapters support Solana payments via x402 protocol
  - Agents can now receive payments in SPL USDC tokens on Solana networks

  ### Interactive Network Selection
  - All CLI templates now include an interactive dropdown for network selection:
    - Base Sepolia (EVM testnet)
    - Base (EVM mainnet)
    - Solana Devnet
    - Solana Mainnet
  - Network selection replaces previous text input for better developer experience

  ### CLI Network Flag
  - Added `--network` flag for non-interactive mode
  - Examples:
    - `bunx @lucid-agents/cli my-agent --network=solana-devnet`
    - `bunx @lucid-agents/cli my-agent --network=solana`
  - Flag skips network prompt and directly sets `PAYMENTS_NETWORK` in generated `.env`

  ## Improvements

  ### Network Validation
  - Added runtime validation in `validatePaymentsConfig()` that dynamically imports supported networks from x402 library
  - Invalid networks (e.g., `solana-mainnet`) are now rejected at configuration time with clear error messages
  - Validation lists all supported networks in error output for better debugging

  ### Documentation
  - Comprehensive Solana setup guide in all README and AGENTS.md files
  - SPL USDC token addresses documented:
    - Mainnet: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
    - Devnet: `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr`
  - Solana configuration examples for both Hono and TanStack adapters
  - Clarified address format differences: EVM (0x-prefixed) vs Solana (Base58)
  - Explained separation between identity registration (EVM-only) and payment receiving (any network)

  ### Template Schemas
  - Updated all 4 template schemas with network enums
  - Added examples for both EVM and Solana addresses
  - Clarified that payment addresses can be shared across multiple agents
  - Identity template now explains that PRIVATE_KEY is for developer's EVM wallet (identity registration), separate from PAYMENTS_RECEIVABLE_ADDRESS

  ## Testing
  - Added Solana payment tests for Hono adapter (6 tests)
  - Added Solana payment tests for TanStack adapter (6 tests)
  - Added core runtime Solana configuration tests (2 tests)
  - Network validation tests verify unsupported networks are rejected
  - All 114 tests passing

  ## Bug Fixes
  - Fixed CI workflow to run on `master` branch instead of `main`
  - Fixed 4 CLI tests using outdated adapter names (`tanstack` → `tanstack-ui`)
  - Fixed test prompt mock to handle network selection dropdown

  ## Notes

  ### Network Names

  The correct Solana network identifiers per x402 specification are:
  - `solana` - Mainnet (NOT `solana-mainnet`)
  - `solana-devnet` - Devnet
  - `solana-mainnet` - Does not exist in x402
  - `solana-testnet` - Does not exist in x402

  ### Architecture Clarifications
  - **Developer wallet (PRIVATE_KEY)**: EVM wallet used for identity registration and deployment
  - **Payment receiving address**: Can be EVM or Solana, used to receive payments at entrypoints
  - **Agent's own wallet**: Future work (for reputation, validation, agent-to-agent calls)
  - Payment addresses can be shared across multiple agents deployed by the same developer

  Closes #11
  - @lucid-agents/identity@1.3.1

## 1.3.0

### Minor Changes

- 1509e59: # Major Refactor: Template-Based Architecture with Adapter Support

  This release introduces a comprehensive refactor of the lucid-agents framework to support multiple runtime adapters and a flexible template system.

  ## Critical Bug Fixes

  ### Security Fix: Removed Hardcoded Payment Wallet Address
  - **CRITICAL**: Payment configuration defaults were previously hardcoded to a specific wallet address
  - All payment config fields (`facilitatorUrl`, `payTo`, `network`) are now `undefined` by default
  - This forces explicit configuration and prevents payments from being sent to incorrect wallets
  - Payment-related types are now properly optional: `payTo?: `0x${string}``

  ### Stream Endpoint HTTP Semantics
  - Stream endpoints are now always registered for all entrypoints
  - Returns proper `400 Bad Request` when streaming is not supported (instead of `404 Not Found`)
  - Improves API consistency and allows clients to optimistically try streaming without manifest lookups
  - Better HTTP semantics: 404 = route doesn't exist, 400 = operation not supported

  ### Config Scoping Fix
  - Removed redundant `payments` property from `createAgentApp` return value
  - Removed module-level global `activeInstanceConfig` to prevent state pollution
  - Single source of truth: use `config.payments` directly
  - Fixes issues with multiple agent instances in same process

  ### Additional Fixes
  - Fixed `ResponseInit` TypeScript linter error by using `ConstructorParameters<typeof Response>[1]`
  - Removed all emojis from codebase (added to coding standards)
  - Fixed 3 failing unit tests from previous refactor
  - Updated test assertions for new API patterns

  ## Breaking Changes
  - **Template System**: Templates now use `.template` file extensions to avoid TypeScript compilation errors during development
  - **Adapter Architecture**: Agent creation now requires selecting an adapter (Hono or TanStack Start)
  - **Payment Config API**: Payment defaults are now `undefined` instead of having fallback values (explicit configuration required)
  - **Return Value**: Removed redundant `payments` property from `createAgentApp` return (use `config.payments` instead)

  ## New Features

  ### Multi-Adapter Support
  - **Hono Adapter** (`@lucid-agents/hono`): Traditional HTTP server adapter
  - **TanStack Start Adapter** (`@lucid-agents/tanstack`): Full-stack React framework adapter with:
    - Headless mode (API only)
    - UI mode (full dashboard with wallet integration)

  ### Template System
  - Templates now support multiple adapters
  - Template files use `.template` extension and are processed during scaffolding
  - Support for adapter-specific code injection via placeholders:
    - `{{ADAPTER_IMPORTS}}`
    - `{{ADAPTER_PRE_SETUP}}`
    - `{{ADAPTER_POST_SETUP}}`
    - `{{ADAPTER_ID}}`

  ### Improved Validation
  - Added validation for identity feature configuration
  - Added payment validation in TanStack adapter
  - Better type safety in route handlers (e.g., params.key validation)

  ### CLI Improvements
  - `--adapter` flag to select runtime framework (hono, tanstack-ui, tanstack-headless)
  - Better error messages for adapter compatibility
  - Clear error suggestions when invalid adapter specified

  ## Package Changes

  ### @lucid-agents/cli
  - Adapter selection system with support for multiple runtime frameworks
  - Template processing with `.template` file handling
  - Adapter-specific file layering system
  - TanStack adapter available in two variants: `tanstack-ui` (full dashboard) and `tanstack-headless` (API only)
  - Non-interactive mode improvements

  ### @lucid-agents/core
  - Split into adapter-specific packages
  - Core functionality moved to `@lucid-agents/agent-core`
  - Improved type definitions

  ### @lucid-agents/hono (NEW)
  - Hono-specific runtime implementation
  - Maintains backward compatibility with existing Hono-based agents

  ### @lucid-agents/tanstack (NEW)
  - TanStack Start runtime implementation
  - File-based routing support
  - Payment middleware integration
  - UI and headless variants

  ### @lucid-agents/identity
  - Improved validation
  - Better integration with template system

  ### @lucid-agents/agent-core (NEW)
  - Shared core functionality across adapters
  - Type definitions and utilities

  ## Migration Guide

  Existing projects using Hono will need to update imports:

  ```typescript
  // Before
  import { createAgentApp } from '@lucid-agents/core';

  // After
  import { createAgentApp } from '@lucid-agents/hono';
  ```

  New projects should specify adapter during creation:

  ```bash
  # Hono adapter
  bunx @lucid-agents/cli my-agent --adapter=hono

  # TanStack with UI (full dashboard)
  bunx @lucid-agents/cli my-agent --adapter=tanstack-ui

  # TanStack headless (API only)
  bunx @lucid-agents/cli my-agent --adapter=tanstack-headless
  ```

### Patch Changes

- Updated dependencies [1509e59]
  - @lucid-agents/identity@1.3.0
  - @lucid-agents/agent-core@0.2.0

## 1.2.1

### Patch Changes

- 069795f: AI agent optimization and documentation enhancement

  ### Non-Interactive CLI Arguments

  Added support for passing template arguments via CLI flags in non-interactive mode. AI coding agents can now fully automate project scaffolding:

  ```bash
  bunx @lucid-agents/cli my-agent \
    --template=identity \
    --non-interactive \
    --AGENT_DESCRIPTION="My agent" \
    --PAYMENTS_RECEIVABLE_ADDRESS="0x..."
  ```

  ### AGENTS.md Documentation

  Added comprehensive AGENTS.md files following the agents.md industry standard (20,000+ projects):
  - Template-specific guides for blank, axllm, axllm-flow, and identity templates
  - Root-level monorepo guide with architecture overview and API reference
  - Example-driven with copy-paste-ready code samples
  - Covers entrypoint patterns, testing, troubleshooting, and common use cases

  ### Template Schema JSON

  Added machine-readable JSON Schema files (`template.schema.json`) for each template documenting all configuration arguments, types, and defaults.

  ### Improvements
  - Fixed boolean handling in environment setup (boolean false now correctly outputs "false" not empty string)
  - Converted IDENTITY_AUTO_REGISTER to confirm-type prompt for better UX
  - Added 11 new comprehensive test cases (21 total, all passing)
  - Updated CLI help text and README with non-interactive examples

  ### Bug Fixes
  - Fixed release bot workflow to use proper dependency sanitization script
  - Ensures published npm packages have resolved workspace and catalog dependencies

- Updated dependencies [069795f]
  - @lucid-agents/identity@1.2.1

## 1.2.0

### Minor Changes

- e5b652c: Complete template system refactor with improved validation and safety
  - **Renamed environment variables** for clarity: `ADDRESS` → `PAYMENTS_RECEIVABLE_ADDRESS`, `APP_NAME` → `AGENT_NAME`, `AUTO_REGISTER` → `IDENTITY_AUTO_REGISTER`
  - **Removed default payment address** (issue #2) - prevents accidental fund loss by requiring explicit wallet address configuration
  - **Added validation** for agent metadata (name, version, description) and payment configuration with clear error messages (issue #8)
  - **Centralized validation** in new `validation.ts` module for reusable, consistent validation logic
  - **Simplified .env generation** - pure `KEY=VALUE` format, all prompts written to .env regardless of value
  - **Standardized wizard terminology** - all templates use "wizard" consistently, removed "onboarding"
  - **Unified wizard prompts** - all templates share identical core prompts for consistency
  - **Added `--wizard=no` flag** for non-interactive usage in CI/CD environments
  - **Removed code generation** from templates - pure runtime configuration via `process.env`
  - **Removed `DEFAULT_TEMPLATE_VALUES`** duplication - `template.json` is single source of truth
  - **Simplified codebase** - removed ~100 lines of complex .env parsing logic

  Breaking changes: Existing projects must update environment variable names in their `.env` files.

### Patch Changes

- @lucid-agents/identity@1.2.0

## 1.1.2

### Patch Changes

- fixed 8004 agent metadata generation
- Updated dependencies
  - @lucid-agents/identity@1.1.2

## 1.1.1

### Patch Changes

- patch
- Updated dependencies
  - @lucid-agents/identity@1.1.1

## 1.1.0

### Minor Changes

- bumps

### Patch Changes

- Updated dependencies
  - @lucid-agents/identity@1.1.0

## 1.0.0

### Patch Changes

- Updated dependencies
  - @lucid-agents/identity@1.0.0

## 0.2.25

### Patch Changes

- bump and namechange

## 0.2.24

### Patch Changes

- fix bug in GET route
- Updated dependencies
  - @lucid-agents/identity@0.2.24
  - @lucid-agents/agent-auth@0.2.24
  - @lucid-dreams/client@0.2.24

## 0.2.23

### Patch Changes

- agent kit fix and invoke page allowing wallet payments
- Updated dependencies
  - @lucid-agents/agent-auth@0.2.23
  - @lucid-agents/identity@0.2.23
  - @lucid-dreams/client@0.2.23

## 0.2.22

### Patch Changes

- fix favicon
- Updated dependencies
  - @lucid-agents/identity@0.2.22
  - @lucid-agents/agent-auth@0.2.22
  - @lucid-dreams/client@0.2.22

## 0.2.21

### Patch Changes

- fix hot
- Updated dependencies
  - @lucid-agents/agent-auth@0.2.21
  - @lucid-agents/identity@0.2.21
  - @lucid-dreams/client@0.2.21

## 0.2.20

### Patch Changes

- 7e25582: update
- fixed kit issue with pricing
- Updated dependencies [7e25582]
- Updated dependencies
  - @lucid-agents/identity@0.2.20
  - @lucid-agents/agent-auth@0.2.20
  - @lucid-dreams/client@0.2.20

## 0.2.19

### Patch Changes

- c023ca0: hey
- Updated dependencies [c023ca0]
  - @lucid-agents/identity@0.2.19
  - @lucid-agents/agent-auth@0.2.19
  - @lucid-dreams/client@0.2.19

## 0.2.18

### Patch Changes

- f470d6a: bump
- Updated dependencies [f470d6a]
  - @lucid-agents/identity@0.2.18
  - @lucid-agents/agent-auth@0.2.18
  - @lucid-dreams/client@0.2.18

## 0.2.17

### Patch Changes

- bump
- Updated dependencies
  - @lucid-agents/identity@0.2.17
  - @lucid-agents/agent-auth@0.2.17
  - @lucid-dreams/client@0.2.17

## 0.2.16

### Patch Changes

- up
- Updated dependencies
  - @lucid-agents/identity@0.2.16
  - @lucid-agents/agent-auth@0.2.16
  - @lucid-dreams/client@0.2.16

## 0.2.15

### Patch Changes

- be4c11a: bump
- Updated dependencies [be4c11a]
  - @lucid-agents/identity@0.2.15
  - @lucid-agents/agent-auth@0.2.15
  - @lucid-dreams/client@0.2.15

## 0.2.14

### Patch Changes

- bumps
- bump
- Updated dependencies
- Updated dependencies
  - @lucid-agents/agent-auth@0.2.14
  - @lucid-agents/identity@0.2.14
  - @lucid-dreams/client@0.2.14

## 0.2.13

### Patch Changes

- bumps
- Updated dependencies
  - @lucid-dreams/client@0.2.13

## 0.2.12

### Patch Changes

- bump
- Updated dependencies
  - @lucid-dreams/client@0.2.12

## 0.2.11

### Patch Changes

- bump
- Updated dependencies
  - @lucid-dreams/client@0.2.11

## 0.2.10

### Patch Changes

- bump it
- Updated dependencies
  - @lucid-dreams/client@0.2.10

## 0.2.9

### Patch Changes

- bump
- Updated dependencies
  - @lucid-dreams/client@0.2.9

## 0.2.8

### Patch Changes

- bump build
- Updated dependencies
  - @lucid-dreams/client@0.2.8

## 0.2.7

### Patch Changes

- examples and cleanup
- Updated dependencies
  - @lucid-dreams/client@0.2.7

## 0.2.6

### Patch Changes

- bump
- Updated dependencies
  - @lucid-dreams/client@0.2.6

## 0.2.5

### Patch Changes

- bump
- bump
- Updated dependencies
- Updated dependencies
  - @lucid-dreams/client@0.2.5

## 0.2.4

### Patch Changes

- bump
- Updated dependencies
  - @lucid-dreams/client@0.2.4

## 0.2.3

### Patch Changes

- bump
- Updated dependencies
  - @lucid-dreams/client@0.2.3

## 0.2.2

### Patch Changes

- bump
- Updated dependencies
  - @lucid-dreams/client@0.2.2

## 0.2.1

### Patch Changes

- bump
- Updated dependencies
  - @lucid-dreams/client@0.2.1

## 0.2.0

### Minor Changes

- bump

### Patch Changes

- Updated dependencies
  - @lucid-dreams/client@0.2.0
