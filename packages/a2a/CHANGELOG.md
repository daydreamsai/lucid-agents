# @lucid-agents/a2a

## 0.5.4

### Patch Changes

- Updated dependencies [0a8ad8f]
  - @lucid-agents/types@1.5.6

## 0.5.3

### Patch Changes

- Updated dependencies [5bafcef]
  - @lucid-agents/types@1.5.5

## 0.5.2

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

## 0.5.1

### Patch Changes

- Updated dependencies [8b1afb7]
  - @lucid-agents/types@1.5.3

## 0.5.0

### Minor Changes

- 222485f: # Bi-directional Payment Tracking, Analytics, and Scheduler Package

  ## Overview

  This changeset implements comprehensive bi-directional payment tracking with persistent storage, incoming payment policies (receivables), a dedicated analytics package, and introduces a new scheduler package for automated agent task execution. The system tracks both outgoing payments (agent pays) and incoming payments (agent receives), with support for multiple storage backends, policy enforcement, and scheduled agent invocations.

  ## New Features

  ### 1. Bi-directional Payment Tracking

  The payments system now tracks both directions of payments:
  - **Outgoing payments** - When your agent pays other agents or services
  - **Incoming payments** - When others pay your agent for services

  All payments are automatically recorded with timestamps, policy group associations, and scope information (global, per-target, per-endpoint, per-sender).

  ### 2. Persistent Storage with Multiple Backends

  Choose the right storage for your deployment:
  - **SQLite (Default)** - Zero-config file-based storage, auto-creates `.data/payments.db`
  - **In-Memory** - Ephemeral storage for serverless without file access
  - **Postgres** - Remote database for serverless with persistence and multi-instance deployments

  All storage implementations use an async interface for consistency and non-blocking operations.

  ### 3. Payment Policy Groups

  Organize policies into named groups for flexible control:
  - **Multiple policy groups** - Apply different policies to different scenarios
  - **Group-based tracking** - Payments are tracked per policy group
  - **Scope-based limits** - Global, per-target, per-endpoint, per-sender scopes

  ### 4. Outgoing Payment Policies

  Control how much your agent can spend:
  - **Per-payment limits** - Maximum amount per individual payment
  - **Total limits** - Maximum total spending over time windows
  - **Time-windowed limits** - Daily, hourly, or custom time windows
  - **Per-target limits** - Different limits for different recipient agents
  - **Per-endpoint limits** - Different limits for different entrypoints
  - **Recipient allow/block lists** - Whitelist or blacklist specific domains or wallet addresses
  - **Rate limiting** - Limit number of payments per time window

  ### 5. Incoming Payment Policies (Receivables)

  Control which payments your agent accepts:
  - **Per-payment limits** - Maximum amount per incoming payment
  - **Total limits** - Maximum total incoming over time windows
  - **Time-windowed limits** - Daily, hourly, or custom time windows
  - **Per-sender limits** - Different limits for different payer addresses
  - **Per-endpoint limits** - Different limits for different entrypoints
  - **Sender allow/block lists** - Whitelist or blacklist specific domains or wallet addresses

  **Policy Enforcement Flow:**
  - Domain-based checks happen **before** payment (can block without receiving payment)
  - Wallet-based checks happen **after** payment (x402 protocol limitation - payment already received)

  ### 6. Analytics Package

  New `@lucid-agents/analytics` package provides comprehensive payment reporting:
  - **Summary statistics** - Outgoing/incoming totals, net amounts, transaction counts
  - **Time-windowed queries** - Filter by time periods (last 24 hours, last week, etc.)
  - **Transaction history** - Complete payment records with filtering
  - **CSV export** - Export data to CSV format for accounting system integration
    - Properly escaped fields (commas, quotes, newlines)
    - Formula injection protection
    - Ready for import into Excel, Google Sheets, or accounting software
  - **JSON export** - Export data to JSON format for programmatic access

  **Use Cases:**
  - Financial reporting and reconciliation
  - Integration with accounting systems (QuickBooks, Xero, etc.)
  - Audit trails and compliance
  - Performance monitoring and optimization
  - Revenue and cost analysis

  ### 7. Scheduler Package

  New `@lucid-agents/scheduler` package provides pull-style scheduling for hiring agents and invoking them on a schedule with bound wallets:
  - **Runtime** - Scheduler runtime with extension system integration
  - **Worker** - Background worker for executing scheduled hires
  - **In-Memory Store** - Default storage for scheduled hires (can be extended)
  - **Type-Safe APIs** - Full TypeScript support for one-time and recurring hires
  - **Interval Scheduling** - Support for recurring tasks with configurable intervals
  - **Multi-Agent Hires** - Schedule hires across multiple agents
  - **Paid Invocations** - Support for scheduling paid agent invocations

  ### 8. Agent Card Fetching API

  New API in `@lucid-agents/a2a` package to fetch agent cards with entrypoint details:
  - Fetch agent cards with full entrypoint information
  - Support for discovering agent capabilities before scheduling
  - Integration with scheduler for dynamic agent discovery

  ### 9. Automatic Payment Recording

  Payments are automatically tracked:
  - **Outgoing payments** - Recorded when using `fetchWithPayment` (policy enforcement happens before payment)
  - **Incoming payments** - Recorded after x402 validation succeeds (policy enforcement happens after payment for wallet-based checks)

  ### 10. Utility Functions

  New shared utility functions for paywall implementations:
  - `extractSenderDomain(origin?, referer?)` - Extract domain from request headers
  - `extractPayerAddress(paymentResponseHeader)` - Extract payer from x402 response header
  - `parsePriceAmount(price)` - Parse price string to bigint (USDC has 6 decimals)

  ## Breaking Changes

  ### Removed Types and Functions
  - **`SpendingTracker`** → Use `PaymentTracker` instead
  - **`createSpendingTracker()`** → Use `createPaymentTracker()` instead
  - **`evaluateSpendingLimits()`** → Use `evaluateOutgoingLimits()` instead
  - **`spendingLimits`** property → Use `outgoingLimits` instead
  - **`spendingTracker`** runtime property → Use `paymentTracker` instead
  - **`SpendingLimit`** type → Use `OutgoingLimit` instead
  - **`SpendingLimitsConfig`** type → Use `OutgoingLimitsConfig` instead

  ### Migration Required

  All code using the old `spendingLimits` and `spendingTracker` APIs must be updated:

  ```typescript
  // Before
  const group: PaymentPolicyGroup = {
    name: 'test',
    spendingLimits: {
      global: { maxTotalUsd: 100.0 },
    },
  };

  // After
  const group: PaymentPolicyGroup = {
    name: 'test',
    outgoingLimits: {
      global: { maxTotalUsd: 100.0 },
    },
  };
  ```

  ## Implementation Details

  ### Storage Interface

  ```typescript
  export interface PaymentStorage {
    recordPayment(
      record: Omit<PaymentRecord, 'id' | 'timestamp'>
    ): Promise<void>;
    getTotal(groupName, scope, direction, windowMs?): Promise<bigint>;
    getAllRecords(
      groupName?,
      scope?,
      direction?,
      windowMs?
    ): Promise<PaymentRecord[]>;
    clear(): Promise<void>;
  }
  ```

  All storage methods are async to support non-blocking Postgres operations and maintain interface consistency across all implementations.

  ### Payment Direction

  ```typescript
  export type PaymentDirection = 'outgoing' | 'incoming';
  ```

  ### Policy Evaluation Functions

  **Outgoing Payments:**
  - `evaluateOutgoingLimits()` - Check outgoing payment limits (async)
  - `evaluateRecipient()` - Check recipient allow/block lists (sync)
  - `evaluatePolicyGroups()` - Evaluate all outgoing policy groups (async)

  **Incoming Payments:**
  - `evaluateIncomingLimits()` - Check incoming payment limits (async)
  - `evaluateSender()` - Check sender allow/block lists (sync)
  - `evaluateIncomingPolicyGroups()` - Evaluate all incoming policy groups (async)

  ### Paywall Integration

  Both Hono and Express paywalls now support:
  1. **Domain-based sender checks** (before x402 middleware)
     - Extracts sender domain from `Origin` or `Referer` headers
     - Returns `403 Forbidden` if blocked
  2. **Incoming payment recording** (after x402 validation)
     - Extracts payer address from `X-PAYMENT-RESPONSE` header
     - Records incoming payment in PaymentTracker

  ### Scheduler Extension

  The scheduler integrates with the agent extension system:

  ```typescript
  import { scheduler } from '@lucid-agents/scheduler';

  const agent = await createAgent({
    name: 'my-agent',
    version: '1.0.0',
  })
    .use(scheduler())
    .build();
  ```

  ### Scheduling Hires

  Schedule one-time or recurring hires:

  ```typescript
  // One-time hire
  await agent.scheduler.schedule({
    agentUrl: 'https://other-agent.com',
    entrypoint: 'process',
    input: { data: 'value' },
    executeAt: Date.now() + 60000, // 1 minute from now
  });

  // Recurring hire (every hour)
  await agent.scheduler.schedule({
    agentUrl: 'https://other-agent.com',
    entrypoint: 'process',
    input: { data: 'value' },
    interval: 3600000, // 1 hour in milliseconds
  });
  ```

  ### Worker Execution

  The scheduler worker automatically executes scheduled hires:
  - Pulls pending hires from the store
  - Executes hires at their scheduled time
  - Handles errors and retries
  - Supports bound wallets for paid invocations

  ## Files Changed

  ### New Files

  **Payments Package:**
  - `packages/payments/src/payment-storage.ts` - Storage interface
  - `packages/payments/src/sqlite-payment-storage.ts` - SQLite implementation
  - `packages/payments/src/in-memory-payment-storage.ts` - In-memory implementation
  - `packages/payments/src/postgres-payment-storage.ts` - Postgres implementation
  - `packages/payments/src/payment-tracker.ts` - Bi-directional payment tracker
  - `packages/payments/README.md` - Comprehensive documentation

  **Analytics Package:**
  - `packages/analytics/src/index.ts` - Main exports
  - `packages/analytics/src/extension.ts` - Analytics extension
  - `packages/analytics/src/api.ts` - Analytics API functions
  - `packages/analytics/src/__tests__/csv-export.test.ts` - CSV export tests
  - `packages/analytics/src/__tests__/format-usdc.test.ts` - USDC formatting tests

  **Scheduler Package:**
  - `packages/scheduler/src/index.ts` - Main exports
  - `packages/scheduler/src/extension.ts` - Scheduler extension
  - `packages/scheduler/src/runtime.ts` - Scheduler runtime
  - `packages/scheduler/src/worker.ts` - Background worker
  - `packages/scheduler/src/store/memory.ts` - In-memory store
  - `packages/scheduler/src/types.ts` - Type definitions
  - `packages/scheduler/README.md` - Package documentation
  - `packages/scheduler/src/__tests__/runtime.test.ts` - Runtime tests
  - `packages/scheduler/src/__tests__/worker.test.ts` - Worker tests
  - `packages/scheduler/src/__tests__/store/memory.test.ts` - Store tests

  **A2A Package:**
  - `packages/a2a/src/agent-card.ts` - Agent card fetching with entrypoint details

  **Examples:**
  - `packages/examples/src/payments/receivables-policies/index.ts` - Incoming payment policy example
  - `packages/examples/src/payments/receivables-policies/env.example` - Environment variables
  - `packages/examples/src/analytics/index.ts` - Analytics usage example
  - `packages/examples/src/analytics/env.example` - Environment variables
  - `packages/examples/src/scheduler/hello-interval/index.ts` - Interval scheduling example
  - `packages/examples/src/scheduler/double-hire/index.ts` - Multi-agent hire example
  - `packages/examples/src/scheduler/paid-invocations/index.ts` - Paid invocation example

  ### Modified Files

  **Payments Package:**
  - `packages/payments/src/payments.ts` - Updated to use PaymentTracker with storage
  - `packages/payments/src/policy.ts` - Added incoming policy evaluation functions
  - `packages/payments/src/policy-wrapper.ts` - Updated to use PaymentTracker
  - `packages/payments/src/runtime.ts` - Updated to use PaymentTracker
  - `packages/payments/src/utils.ts` - Added utility functions
  - `packages/payments/src/policy-schema.ts` - Updated schema for incoming policies
  - `packages/payments/src/env.ts` - Updated documentation
  - `packages/payments/src/index.ts` - Updated exports
  - `packages/payments/src/__tests__/policy.test.ts` - Updated tests
  - `packages/payments/src/__tests__/policy-wrapper.test.ts` - Updated tests
  - `packages/payments/src/__tests__/payment-tracker.test.ts` - Renamed from spending-tracker.test.ts and updated
  - `packages/payments/package.json` - Added dependencies (`better-sqlite3`, `pg`)

  **Types Package:**
  - `packages/types/src/payments/index.ts` - Added new types, removed deprecated types
  - `packages/types/src/analytics/index.ts` - New analytics types domain
  - `packages/types/src/scheduler/index.ts` - Scheduler type definitions

  **Hono Adapter:**
  - `packages/hono/src/paywall.ts` - Added receivables policy checking and incoming payment recording
  - `packages/hono/src/app.ts` - Pass runtime to paywall
  - `packages/hono/src/__tests__/incoming-payments.test.ts` - New tests for incoming payment recording

  **Express Adapter:**
  - `packages/express/src/paywall.ts` - Added receivables policy checking and incoming payment recording
  - `packages/express/src/app.ts` - Pass runtime to paywall
  - `packages/express/src/__tests__/paywall.test.ts` - New tests for incoming payment recording

  **A2A Package:**
  - `packages/a2a/src/index.ts` - Export agent card fetching API

  **Core Package:**
  - `packages/core/README.md` - Updated payment section with bi-directional tracking info and link to payments README

  **Examples:**
  - `packages/examples/src/payments/policy-agent/index.ts` - Updated to use `outgoingLimits`
  - `packages/examples/src/payments/payment-policies.json` - Updated to use `outgoingLimits`
  - `packages/examples/src/payments/payment-policies.json.example` - Updated to use `outgoingLimits`
  - `packages/examples/package.json` - Added scheduler dependency

  ### Deleted Files
  - `packages/payments/src/spending-tracker.ts` - Replaced by PaymentTracker

  ## Dependencies Added

  **Payments Package:**
  - `better-sqlite3@^11.7.0` - SQLite database
  - `pg@^8.13.1` - PostgreSQL client
  - `@types/better-sqlite3@^7.6.13` - TypeScript types
  - `@types/pg@^8.11.10` - TypeScript types

  **Analytics Package:**
  - `viem@^2.41.2` - For USDC amount formatting (formatUnits)

  **Scheduler Package:**
  - `@lucid-agents/a2a` - For agent card fetching and invocations
  - `@lucid-agents/types` - For type definitions

  ## Known Limitations

  ### x402 Protocol Limitation

  **Wallet-based sender checks and incoming limits can only be evaluated AFTER payment is received.**

  This is a fundamental limitation of the x402 protocol - the payer address is only available in the `X-PAYMENT-RESPONSE` header after payment validation. This means:
  - **Domain-based checks** can block before payment (using `Origin`/`Referer` headers)
  - **Wallet-based checks** can only block after payment (payment already received)
  - **Incoming limits** can only be checked after payment (payment already received)

  **Workaround:** Use domain-based sender checks for early blocking. Wallet-based checks will still return `403 Forbidden` but payment was already received.

  ## Migration Guide

  ### Step 1: Update Policy Configurations

  Replace `spendingLimits` with `outgoingLimits` in all policy files:

  ```json
  {
    "name": "Daily Limit",
    "outgoingLimits": {
      "global": {
        "maxTotalUsd": 100.0
      }
    }
  }
  ```

  ### Step 2: Update Code References

  ```typescript
  // Before
  const tracker = createSpendingTracker();
  tracker.recordSpending('group', 'scope', amount);
  const total = tracker.getCurrentTotal('group', 'scope');

  // After
  const tracker = createPaymentTracker();
  tracker.recordOutgoing('group', 'scope', amount);
  const total = tracker.getOutgoingTotal('group', 'scope');
  ```

  ### Step 3: Update Policy Evaluation

  ```typescript
  // Before
  evaluateSpendingLimits(group, tracker, targetUrl, endpointUrl, amount);

  // After
  await evaluateOutgoingLimits(group, tracker, targetUrl, endpointUrl, amount);
  ```

  ### Step 4: Add Incoming Policies (Optional)

  ```typescript
  {
    name: 'Incoming Controls',
    incomingLimits: {
      global: { maxTotalUsd: 5000.0 }
    },
    blockedSenders: {
      domains: ['https://untrusted.example.com'],
      wallets: ['0x123...']
    },
    allowedSenders: {
      domains: ['https://trusted.example.com'],
      wallets: ['0x456...']
    }
  }
  ```

  ## Use Cases

  **Payment Tracking & Analytics:**
  - Financial reporting and reconciliation
  - Integration with accounting systems (QuickBooks, Xero, etc.)
  - Audit trails and compliance
  - Performance monitoring and optimization
  - Revenue and cost analysis

  **Scheduler:**
  - Automated Data Processing - Schedule regular data processing tasks
  - Multi-Agent Workflows - Coordinate tasks across multiple agents
  - Scheduled Reports - Generate and send reports on a schedule
  - Periodic Health Checks - Monitor agent health and status
  - Paid Service Invocations - Schedule paid agent service calls

### Patch Changes

- Updated dependencies [222485f]
  - @lucid-agents/types@1.5.2

## 0.4.1

### Patch Changes

- Updated dependencies [2e95dcf]
  - @lucid-agents/types@1.5.1

## 0.4.0

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
  - @lucid-agents/types@1.4.0

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
