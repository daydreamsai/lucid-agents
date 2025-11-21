# @lucid-agents/tanstack

## 0.5.1

### Patch Changes

- Updated dependencies [ae09320]
  - @lucid-agents/core@1.7.0
  - @lucid-agents/payments@1.7.0
  - @lucid-agents/types@1.3.0

## 0.5.0

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

## 0.4.2

### Patch Changes

- Updated dependencies [c1f12dd]
  - @lucid-agents/core@1.5.2
  - @lucid-agents/payments@1.5.2

## 0.4.1

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
  - @lucid-agents/core@1.5.1
  - @lucid-agents/types@1.1.1
  - @lucid-agents/payments@1.5.1

## 0.4.0

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
  - @lucid-agents/core@1.5.0
  - @lucid-agents/payments@1.5.0

## 0.3.2

### Patch Changes

- @lucid-agents/core@1.4.2
- @lucid-agents/payments@1.1.2

## 0.3.1

### Patch Changes

- Updated dependencies [71f9142]
  - @lucid-agents/core@1.4.1
  - @lucid-agents/payments@1.1.1

## 0.3.0

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
  - @lucid-agents/core@1.4.0
  - @lucid-agents/payments@1.1.0

## 0.2.1

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

- Updated dependencies [574e9b0]
  - @lucid-agents/core@1.3.1

## 0.2.0

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
  - @lucid-agents/core@1.3.0
