# @lucid-agents/identity

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
  await identity.clients.reputation.giveFeedback({ toAgentId: 42n, score: 90 });
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
await identity.clients.reputation.giveFeedback({ toAgentId: 42n, score: 90 });
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
