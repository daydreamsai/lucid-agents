# @lucid-agents/payments

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
  - @lucid-agents/types@1.2.0

## 1.5.2

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

## 1.1.2

### Patch Changes

- @lucid-agents/core@1.4.2

## 1.1.1

### Patch Changes

- Updated dependencies [71f9142]
  - @lucid-agents/core@1.4.1

## 1.1.0

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
