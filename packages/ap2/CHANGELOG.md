# @lucid-agents/ap2

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
  - @lucid-agents/types@1.3.0
