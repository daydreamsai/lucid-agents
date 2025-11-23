# @lucid-agents/express

## 0.3.0

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

## 0.2.0

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
  - @lucid-agents/core@1.7.0
  - @lucid-agents/payments@1.7.0
  - @lucid-agents/types@1.3.0

## 0.1.0

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
  - @lucid-agents/types@1.2.0
  - @lucid-agents/core@1.6.0
  - @lucid-agents/payments@1.6.0

## 0.0.1

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

- Updated dependencies [c1f12dd]
  - @lucid-agents/core@1.5.2
  - @lucid-agents/payments@1.5.2
