# @lucid-agents/examples

## 0.2.14

### Patch Changes

- Updated dependencies [f21f5d3]
  - @lucid-agents/identity@2.2.1
  - @lucid-agents/core@2.2.1
  - @lucid-agents/payments@2.2.1
  - @lucid-agents/a2a@0.5.5
  - @lucid-agents/hono@0.7.18
  - @lucid-agents/analytics@0.2.6

## 0.2.13

### Patch Changes

- Updated dependencies [b9c294c]
  - @lucid-agents/payments@2.2.0
  - @lucid-agents/hono@0.7.17
  - @lucid-agents/analytics@0.2.6
  - @lucid-agents/core@2.2.0
  - @lucid-agents/a2a@0.5.5
  - @lucid-agents/identity@2.2.0

## 0.2.12

### Patch Changes

- Updated dependencies [23a7254]
  - @lucid-agents/identity@2.1.3
  - @lucid-agents/types@1.5.7
  - @lucid-agents/wallet@0.5.8
  - @lucid-agents/core@2.1.3
  - @lucid-agents/a2a@0.5.5
  - @lucid-agents/analytics@0.2.6
  - @lucid-agents/hono@0.7.16
  - @lucid-agents/http@1.9.8
  - @lucid-agents/payments@2.1.3
  - @lucid-agents/scheduler@0.1.5

## 0.2.11

### Patch Changes

- Updated dependencies [25e480a]
  - @lucid-agents/wallet@0.5.7
  - @lucid-agents/core@2.1.2
  - @lucid-agents/hono@0.7.15
  - @lucid-agents/identity@2.1.2
  - @lucid-agents/payments@2.1.2
  - @lucid-agents/a2a@0.5.4
  - @lucid-agents/analytics@0.2.5

## 0.2.10

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

- Updated dependencies [4bd3ac2]
  - @lucid-agents/identity@2.1.1
  - @lucid-agents/core@2.1.1
  - @lucid-agents/payments@2.1.1
  - @lucid-agents/a2a@0.5.4
  - @lucid-agents/hono@0.7.14
  - @lucid-agents/analytics@0.2.5

## 0.2.9

### Patch Changes

- Updated dependencies [e47b214]
  - @lucid-agents/identity@2.1.0
  - @lucid-agents/core@2.1.0
  - @lucid-agents/payments@2.1.0
  - @lucid-agents/a2a@0.5.4
  - @lucid-agents/hono@0.7.13
  - @lucid-agents/analytics@0.2.5

## 0.2.8

### Patch Changes

- Updated dependencies [d088313]
  - @lucid-agents/identity@2.0.0
  - @lucid-agents/core@2.0.0
  - @lucid-agents/payments@2.0.0
  - @lucid-agents/a2a@0.5.4
  - @lucid-agents/hono@0.7.12
  - @lucid-agents/analytics@0.2.5

## 0.2.7

### Patch Changes

- Updated dependencies [0a8ad8f]
  - @lucid-agents/types@1.5.6
  - @lucid-agents/wallet@0.5.6
  - @lucid-agents/a2a@0.5.4
  - @lucid-agents/analytics@0.2.5
  - @lucid-agents/core@1.12.2
  - @lucid-agents/hono@0.7.11
  - @lucid-agents/http@1.9.7
  - @lucid-agents/identity@1.12.2
  - @lucid-agents/payments@1.12.2
  - @lucid-agents/scheduler@0.1.4

## 0.2.6

### Patch Changes

- Updated dependencies [5bafcef]
  - @lucid-agents/identity@1.12.1
  - @lucid-agents/wallet@0.5.5
  - @lucid-agents/types@1.5.5
  - @lucid-agents/core@1.12.1
  - @lucid-agents/hono@0.7.10
  - @lucid-agents/a2a@0.5.3
  - @lucid-agents/analytics@0.2.4
  - @lucid-agents/http@1.9.6
  - @lucid-agents/payments@1.12.1
  - @lucid-agents/scheduler@0.1.3

## 0.2.5

### Patch Changes

- Updated dependencies [d2b4b6b]
  - @lucid-agents/identity@1.12.0
  - @lucid-agents/core@1.12.0
  - @lucid-agents/payments@1.12.0
  - @lucid-agents/a2a@0.5.2
  - @lucid-agents/hono@0.7.9

## 0.2.4

### Patch Changes

- Updated dependencies [03d5279]
  - @lucid-agents/payments@1.11.0
  - @lucid-agents/core@1.11.0
  - @lucid-agents/hono@0.7.8
  - @lucid-agents/a2a@0.5.2
  - @lucid-agents/identity@1.11.0

## 0.2.3

### Patch Changes

- Updated dependencies [70d804e]
  - @lucid-agents/payments@1.10.3
  - @lucid-agents/analytics@0.2.3
  - @lucid-agents/core@1.10.3
  - @lucid-agents/hono@0.7.7
  - @lucid-agents/a2a@0.5.2
  - @lucid-agents/identity@1.10.3

## 0.2.2

### Patch Changes

- Updated dependencies [9abbd6a]
  - @lucid-agents/payments@1.10.2
  - @lucid-agents/core@1.10.2
  - @lucid-agents/types@1.5.4
  - @lucid-agents/analytics@0.2.2
  - @lucid-agents/a2a@0.5.2
  - @lucid-agents/http@1.9.5
  - @lucid-agents/scheduler@0.1.2
  - @lucid-agents/hono@0.7.6
  - @lucid-agents/identity@1.10.2
  - @lucid-agents/wallet@0.5.4

## 0.2.1

### Patch Changes

- Updated dependencies [8b1afb7]
  - @lucid-agents/http@1.9.4
  - @lucid-agents/payments@1.10.1
  - @lucid-agents/types@1.5.3
  - @lucid-agents/identity@1.10.1
  - @lucid-agents/a2a@0.5.1
  - @lucid-agents/hono@0.7.5
  - @lucid-agents/core@1.10.1
  - @lucid-agents/analytics@0.2.1
  - @lucid-agents/scheduler@0.1.1
  - @lucid-agents/wallet@0.5.3

## 0.2.0

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
  - @lucid-agents/payments@1.10.0
  - @lucid-agents/analytics@0.2.0
  - @lucid-agents/scheduler@0.1.0
  - @lucid-agents/a2a@0.5.0
  - @lucid-agents/hono@0.7.4
  - @lucid-agents/types@1.5.2
  - @lucid-agents/core@1.10.0
  - @lucid-agents/http@1.9.3
  - @lucid-agents/identity@1.10.0
  - @lucid-agents/wallet@0.5.2

## 0.1.3

### Patch Changes

- Updated dependencies [2e95dcf]
  - @lucid-agents/payments@1.9.2
  - @lucid-agents/types@1.5.1
  - @lucid-agents/core@1.9.2
  - @lucid-agents/hono@0.7.3
  - @lucid-agents/http@1.9.2
  - @lucid-agents/a2a@0.4.1
  - @lucid-agents/identity@1.9.2
  - @lucid-agents/wallet@0.5.1

## 0.1.2

### Patch Changes

- 026ec23: ## Summary
  - Added thirdweb Engine wallet connector that integrates with thirdweb Engine server wallets. The connector lazily initializes the Engine account, converts it to a viem wallet client, and exposes it via the shared `WalletConnector` API.
  - Introduced shared wallet client abstraction with capability detection. All connectors now expose optional `getCapabilities()`, `getSigner()`, and `getWalletClient()` methods, enabling uniform access to signers and contract-ready wallet clients across connector types.
  - Enhanced local EOA connectors to automatically build viem wallet clients from signers. Configure `walletClient` (chain ID, RPC URL, chain name) on local wallet options to enable `getWalletClient()` support.
  - Standardized environment variable naming to use `AGENT_WALLET_*` prefix for all wallet types, including thirdweb.
  - Reorganized code structure: moved `createPrivateKeySigner` and wallet client creation helpers into `local-eoa-connector.ts` where they belong.
  - Added comprehensive unit tests for capability detection, signer access, and wallet client creation.
  - Updated documentation with unified wallet client usage patterns and environment variable configuration.

  ## Breaking Changes
  - **Environment variable configuration now requires `AGENT_WALLET_TYPE`**. The `walletsFromEnv()` helper will throw an error if `AGENT_WALLET_TYPE` is not set. Previously, the type could be inferred from available variables.

  ## Migration Notes
  - **Set `AGENT_WALLET_TYPE` explicitly**: Update your environment variables to include `AGENT_WALLET_TYPE=local`, `AGENT_WALLET_TYPE=thirdweb`, or `AGENT_WALLET_TYPE=lucid`.
  - **Use unified wallet client API**: All connectors now support `getWalletClient()` when configured. Check capabilities before calling:
    ```ts
    const capabilities = connector.getCapabilities?.();
    if (capabilities?.walletClient) {
      const walletHandle = await connector.getWalletClient();
      const walletClient = walletHandle?.client;
    }
    ```

  ### Usage Example

  ```ts
  const agent = await createAgent(meta)
    .use(http())
    .use(
      wallets({
        config: {
          agent: {
            type: 'thirdweb',
            secretKey: process.env.AGENT_WALLET_SECRET_KEY!,
            clientId: process.env.AGENT_WALLET_CLIENT_ID,
            walletLabel: 'agent-wallet',
            chainId: 84532,
          },
        },
      })
    )
    .build();

  const connector = agent.wallets?.agent?.connector;
  const capabilities = connector?.getCapabilities?.();
  if (capabilities?.walletClient && connector?.getWalletClient) {
    const walletHandle = await connector.getWalletClient();
    const walletClient = walletHandle?.client;

    await walletClient.writeContract({
      account: walletClient.account,
      chain: walletClient.chain,
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'transfer',
      args: ['0xEA4b0D5ebF46C22e4c7E6b6164706447e67B9B1D', 10_000n],
    });
  }
  ```

- Updated dependencies [026ec23]
  - @lucid-agents/wallet@0.5.0
  - @lucid-agents/core@1.9.1
  - @lucid-agents/hono@0.7.2
  - @lucid-agents/identity@1.9.1
  - @lucid-agents/a2a@0.4.0
  - @lucid-agents/http@1.9.1
  - @lucid-agents/payments@1.9.1

## 0.1.1

### Patch Changes

- Updated dependencies [1ffbd1d]
  - @lucid-agents/core@1.9.0
  - @lucid-agents/types@1.5.0
  - @lucid-agents/payments@1.9.0
  - @lucid-agents/http@1.9.0
  - @lucid-agents/wallet@0.4.0
  - @lucid-agents/identity@1.9.0
  - @lucid-agents/a2a@0.4.0
  - @lucid-agents/hono@0.7.1
