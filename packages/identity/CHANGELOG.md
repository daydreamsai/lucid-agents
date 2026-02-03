# @lucid-agents/identity

## 2.2.3

## 2.2.2

## 2.2.1

### Patch Changes

- f21f5d3: Add support for custom `agentURI` parameter in identity registration
  - Added `agentURI` option to `CreateAgentIdentityOptions`, `BootstrapIdentityOptions`, and `BootstrapTrustOptions`
  - When provided, the custom `agentURI` is used for ERC-8004 registration instead of the default `.well-known/agent-registration.json` format
  - This allows agents to register with URIs like `https://api.example.com/agents/ag_xxx/.well-known/agent-card.json`

## 2.2.0

## 2.1.3

### Patch Changes

- 23a7254: ERC-8004 Identity Registry updates and ABI alignment:

  **New Features**
  - Agent wallet management (`getAgentWallet`, `setAgentWallet`, `unsetAgentWallet`) with EIP-712 signing
  - `unsetAgentWallet(agentId)` now calls dedicated on-chain function directly (no signature required)
  - `isAuthorizedOrOwner(spender, agentId)` read function to check authorization
  - Optional validation request bodies that are hashed

  **API Changes**
  - Identity manifest renamed from "metadata" to "registration" and now includes registry identifier
  - Reputation feedback uses integer `value` + `valueDecimals` format
  - Validation request/response payloads and identifiers updated
  - New version/registry discovery endpoints added
  - `registryAddress` required when building trust config from identity records

  **Documentation**
  - Examples, guides, tests, and changelogs updated to registration-centric workflow
  - New reputation/validation formats documented

- Updated dependencies [23a7254]
  - @lucid-agents/types@1.5.7
  - @lucid-agents/wallet@0.5.8

## 2.1.2

### Patch Changes

- Added `agentRegistry` to registration entries and require `registryAddress` when building trust config from identity records.
- Added agent wallet helpers (`getAgentWallet`, `setAgentWallet`, `unsetAgentWallet`) plus EIP-712 typed data helpers for wallet updates.
- Reputation registry now uses `value` + `valueDecimals` and validates integer feedback values.
- Validation requests now hash `requestBody` when provided and fall back to `requestUri` for backward compatibility.
- Updated tests, examples, and docs for registration file hosting and reputation/validation changes.
- Updated dependencies [25e480a]
  - @lucid-agents/wallet@0.5.7

## 2.1.1

### Patch Changes

- 4bd3ac2: Switch default network from Base Sepolia to Ethereum Mainnet

  CHANGES:
  - Default payment network changed from `base-sepolia` to `ethereum` across all CLI templates and adapters
  - Added Ethereum Mainnet ERC-8004 contract addresses:
    - Identity Registry: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
    - Reputation Registry: `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`
  - Updated all template defaults (blank, axllm, axllm-flow, identity, trading-data-agent, trading-recommendation-agent)
  - Updated CLI adapter network configurations (hono, express, next)
  - Updated example environment files
  - Updated documentation and READMEs

  MIGRATION:

  Existing agents are not affected - they retain their configured network. New agents created via CLI will default to Ethereum Mainnet. To use a testnet, explicitly select `base-sepolia` during agent creation or set `PAYMENTS_NETWORK=base-sepolia` in your `.env` file.

## 2.1.0

### Minor Changes

- e47b214: Add transfer functions to identity registry client
  - `transfer(to, agentId)` - Transfer identity token to another EVM address using safeTransferFrom
  - `transferFrom(from, to, agentId)` - Transfer from one address to another (signer must be owner or approved)
  - `approve(to, agentId)` - Approve an address to transfer the identity token
  - `setApprovalForAll(operator, approved)` - Approve or revoke an operator for all tokens
  - `getApproved(agentId)` - Get the approved address for a token (read-only)

## 2.0.0

### Major Changes

- d088313: ERC-8004 January 2026 Specification Update

  BREAKING CHANGES:
  - Reputation Registry `giveFeedback()`: Removed `feedbackAuth`, `expiry`, `indexLimit` parameters. Added optional `endpoint` parameter (defaults to empty string if not provided). Tags are now `string` instead of `bytes32` or `Hex`.
  - Identity Registry: `tokenURI` renamed to `agentURI` throughout. `register()` now takes `agentURI` instead of `tokenURI`. `tokenURI()` function still exists for ERC-721 compatibility but should be treated as `agentURI` conceptually.
  - Validation Registry: Deprecated and removed from default client creation. Under active development, will be updated in follow-up spec update later this year. **Breaking changes**: Function names changed (`createRequest` → `validationRequest`, `submitResponse` → `validationResponse`). Tag types changed from `bytes32`/`Hex` to `string` in `getSummary()`, `getValidationStatus()`, and `validationResponse()`.
  - Contract Addresses: Only ETH Sepolia is deployed with new Jan 2026 addresses. Other chains are commented out until new contracts are deployed.

  NEW FEATURES:
  - Added `setAgentURI()` function to IdentityRegistryClient for updating agent URIs after registration
  - Added `getVersion()` function to all registry clients (Identity, Reputation, Validation) for checking contract versions
  - Added validation to block reserved `agentWallet` metadata key in `setMetadata()` with clear error message

  IMPROVEMENTS:
  - Updated `getAllFeedback()` to handle new `feedbackIndexes` return value from contract
  - Updated all feedback tag types from `bytes32`/`Hex` to `string` for better usability
  - Improved type safety with correct return types for all registry functions
  - `readAllFeedback()` now returns `feedbackIndexes` as second element (not first as spec initially indicated, matching actual contract behavior)

  MIGRATION:

  See MIGRATION.md for detailed migration guide and code examples.

## 1.12.2

### Patch Changes

- Updated dependencies [0a8ad8f]
  - @lucid-agents/types@1.5.6
  - @lucid-agents/wallet@0.5.6

## 1.12.1

### Patch Changes

- 5bafcef: Remove `clientFactory` parameter from `createAgentIdentity` and add support for signer-based developer wallets. Replace LocalEoaSigner with ViemWalletConnector for browser wallet support. SignerWalletOptions now accepts a viem WalletClient directly instead of LocalEoaSigner, enabling browser wallets (e.g., thirdweb) that use eth_sendTransaction instead of eth_signTransaction. Add ViemWalletConnector class that wraps a viem WalletClient directly for both developer and agent wallets. Update createDeveloperWallet and buildSignerWallet to use ViemWalletConnector for signer wallets. Update makeViemClientsFromWallet to prioritize getWalletClient() method. This simplifies the API by allowing direct wallet client passing via `runtime.wallets.developer` instead of requiring a client factory function.
- Updated dependencies [5bafcef]
  - @lucid-agents/wallet@0.5.5
  - @lucid-agents/types@1.5.5

## 1.12.1

### Patch Changes

- Remove `clientFactory` parameter from `createAgentIdentity` (unnecessary workaround)
- Add support for signer-based developer wallets via `DeveloperWalletConfig`
- `DeveloperWalletHandle` now supports both `'local'` and `'signer'` kinds
- Update client-side identity registration to use direct developer wallet creation
- Fix validation error messages to reference `runtime.wallets.developer` instead of `runtime.wallets.agent`

## 1.12.0

### Minor Changes

- d2b4b6b: Add support for custom client factory via `makeClients` parameter in `createAgentIdentity`. This enables browser-based wallet integration (e.g., thirdweb) by allowing custom Viem client creation instead of requiring a wallet handle from the runtime.

## 1.11.0

## 1.10.3

## 1.10.2

### Patch Changes

- Updated dependencies [9abbd6a]
  - @lucid-agents/types@1.5.4
  - @lucid-agents/wallet@0.5.4

## 1.10.1

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
  - @lucid-agents/wallet@0.5.3

## 1.10.0

### Patch Changes

- Updated dependencies [222485f]
  - @lucid-agents/types@1.5.2
  - @lucid-agents/wallet@0.5.2

## 1.9.2

### Patch Changes

- Updated dependencies [2e95dcf]
  - @lucid-agents/types@1.5.1
  - @lucid-agents/wallet@0.5.1

## 1.9.1

### Patch Changes

- Updated dependencies [026ec23]
  - @lucid-agents/wallet@0.5.0

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
  - @lucid-agents/wallet@0.4.0

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

## 1.5.2

## 1.5.1

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

## 1.4.2

## 1.4.1

## 1.4.0

## 1.3.1

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

## 1.2.0

## 1.1.2

### Patch Changes

- fixed 8004 agent metadata generation

## 1.1.1

### Patch Changes

- patch

## 1.1.0

### Minor Changes

- bumps

## 1.0.0

### Major Changes

- Complete ERC-8004 v1.0 Implementation

  **Added full support for all three ERC-8004 registries:**
  - Identity Registry (fixed existing implementation)
  - Reputation Registry (new - peer feedback system)
  - Validation Registry (new - work validation)

  All three clients returned via `createAgentIdentity()` in `identity.clients`.

  **Breaking Changes:**

  **Fixed core issues:**
  - Replaced incorrect ABI with actual ERC-8004 v1.0 contracts
  - Fixed import paths preventing signature generation
  - Uses real contract functions instead of non-existent ones
  - Removed synthetic trust fallback logic
  - Auto-adds `0x` prefix to private keys

  **Refactored to Viem actions:**
  - Replaced duck-typed `signer.signMessage()` with proper Viem actions
  - New `src/utils/signatures.ts` with type-safe signing helpers
  - Supports EIP-191, EIP-712, and ERC-1271

  **Repository reorganization:**

  ```
  src/
  ├── registries/      # identity.ts, reputation.ts, validation.ts
  ├── utils/           # signatures.ts, address.ts, domain.ts
  ├── config/          # erc8004.ts (addresses & constants)
  ├── abi/             # contract ABIs
  └── ...
  ```

  **Added:**
  - `createReputationRegistryClient()` - feedback submission, queries, stats
  - `createValidationRegistryClient()` - validation requests, responses, queries
  - Automatic signature generation for feedback authorization
  - Tag normalization (string → bytes32)
  - `signMessageWithViem()`, `signTypedDataWithViem()` - proper Viem actions
  - `signFeedbackAuth()`, `signValidationRequest()` - ERC-8004 signing
  - `verifySignature()` - EOA + ERC-1271 verification
  - `recoverSigner()` - address recovery
  - `ERC8004_ADDRESSES` - all three registry addresses
  - `DEFAULT_CHAIN_ID`, `DEFAULT_NAMESPACE`, `DEFAULT_TRUST_MODELS`
  - `getRegistryAddress()`, `isERC8004Registry()` helpers
  - `examples/test-clients.ts` - demonstrates all three clients

  **Changed:**
  - Renamed `identity.ts` → `registries/identity.ts`
  - Split `utils.ts` → `utils/address.ts`, `utils/domain.ts`, `utils/signatures.ts`
  - `createAgentIdentity()` now returns `clients` with all three registries
  - Status messages show when signatures are included

  **Removed:**
  - `fallback` parameter
  - `identity.synthetic` property
  - Duck-typed `MessageSignerLike` union
  - `invokeSignMessage()` helper

  **Upgrade:**

  ```ts
  // Before
  const identity = await bootstrapIdentity({ domain, registerIfMissing: true });

  // After
  const identity = await createAgentIdentity({ domain, autoRegister: true });

  // New: Access all three registries
  await identity.clients.reputation.giveFeedback({ toAgentId: 42n, score: 90, endpoint: '' });
  await identity.clients.validation.createRequest({ ... });
  ```

  **Contract addresses (CREATE2 - same on all chains):**
  - Identity: `0x7177a6867296406881E20d6647232314736Dd09A`
  - Reputation: `0xB5048e3ef1DA4E04deB6f7d0423D06F63869e322`
  - Validation: `0x662b40A526cb4017d947e71eAF6753BF3eeE66d8`

## 0.2.25

### Patch Changes

- bump and namechange

## Unreleased

### Patch Changes

- Added `transfer(to, agentId)`, `transferFrom(from, to, agentId)`, `approve(to, agentId)`, `setApprovalForAll(operator, approved)`, and `getApproved(agentId)` to IdentityRegistryClient. Reject zero/invalid EVM addresses; use normalized addresses in contract args. Enables register-then-transfer and approved-spender flows (EVM-only; Solana addresses invalid).

### Major - Complete ERC-8004 v1.0 Implementation

**Added full support for all three ERC-8004 registries:**

- Identity Registry (fixed existing implementation)
- Reputation Registry (new - peer feedback system)
- Validation Registry (new - work validation)

All three clients returned via `createAgentIdentity()` in `identity.clients`.

### Breaking Changes

**Fixed core issues:**

- Replaced incorrect ABI with actual ERC-8004 v1.0 contracts
- Fixed import paths preventing signature generation
- Uses real contract functions instead of non-existent ones
- Removed synthetic trust fallback logic
- Auto-adds `0x` prefix to private keys

**Refactored to Viem actions:**

- Replaced duck-typed `signer.signMessage()` with proper Viem actions
- New `src/utils/signatures.ts` with type-safe signing helpers
- Supports EIP-191, EIP-712, and ERC-1271

**Repository reorganization:**

```
src/
├── registries/      # identity.ts, reputation.ts, validation.ts
├── utils/           # signatures.ts, address.ts, domain.ts
├── config/          # erc8004.ts (addresses & constants)
├── abi/             # contract ABIs
└── ...
```

### Added

**Registry Clients:**

- `createReputationRegistryClient()` - feedback submission, queries, stats
- `createValidationRegistryClient()` - validation requests, responses, queries
- Automatic signature generation for feedback authorization
- Tag normalization (string → bytes32)

**Utilities:**

- `signMessageWithViem()`, `signTypedDataWithViem()` - proper Viem actions
- `signFeedbackAuth()`, `signValidationRequest()` - ERC-8004 signing
- `verifySignature()` - EOA + ERC-1271 verification
- `recoverSigner()` - address recovery

**Configuration:**

- `ERC8004_ADDRESSES` - all three registry addresses
- `DEFAULT_CHAIN_ID`, `DEFAULT_NAMESPACE`, `DEFAULT_TRUST_MODELS`
- `getRegistryAddress()`, `isERC8004Registry()` helpers

**Examples:**

- `examples/test-clients.ts` - demonstrates all three clients

### Changed

- Renamed `identity.ts` → `registries/identity.ts`
- Split `utils.ts` → `utils/address.ts`, `utils/domain.ts`, `utils/signatures.ts`
- `createAgentIdentity()` now returns `clients` with all three registries
- Status messages show when signatures are included

### Removed

- `fallback` parameter
- `identity.synthetic` property
- Duck-typed `MessageSignerLike` union
- `invokeSignMessage()` helper

### Fixed

- Import paths (`./abi/types` not `./ValidationRegistry.json/types`)
- ABI reference (`IdentityRegistry.json` not `ValidationRegistry.json`)
- Event signature parsing (verified correct via keccak256)
- TypeScript JSON imports (`resolveJsonModule: true`)
- Test mocks for Viem's `request()` method

### Upgrade

```ts
// Before
const identity = await bootstrapIdentity({ domain, registerIfMissing: true });

// After
const identity = await createAgentIdentity({ domain, autoRegister: true });

// New: Access all three registries
await identity.clients.reputation.giveFeedback({ toAgentId: 42n, score: 90, endpoint: '' });
await identity.clients.validation.createRequest({ ... });
```

**Contract addresses (CREATE2 - same on all chains):**

- Identity: `0x7177a6867296406881E20d6647232314736Dd09A`
- Reputation: `0xB5048e3ef1DA4E04deB6f7d0423D06F63869e322`
- Validation: `0x662b40A526cb4017d947e71eAF6753BF3eeE66d8`

## 0.2.24

### Patch Changes

- fix bug in GET route

## 0.2.23

### Patch Changes

- agent kit fix and invoke page allowing wallet payments

## 0.2.22

### Patch Changes

- fix favicon

## 0.2.21

### Patch Changes

- fix hot

## 0.2.20

### Patch Changes

- 7e25582: update
- fixed kit issue with pricing

## 0.2.19

### Patch Changes

- c023ca0: hey

## 0.2.18

### Patch Changes

- f470d6a: bump

## 0.2.17

### Patch Changes

- bump

## 0.2.16

### Patch Changes

- up

## 0.2.15

### Patch Changes

- be4c11a: bump

## 0.2.14

### Patch Changes

- bumps
- bump
