# @lucid-agents/agent-kit-identity

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
  - **Hono Adapter** (`@lucid-agents/agent-kit-hono`): Traditional HTTP server adapter
  - **TanStack Start Adapter** (`@lucid-agents/agent-kit-tanstack`): Full-stack React framework adapter with:
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

  ### @lucid-agents/create-agent-kit
  - Adapter selection system with support for multiple runtime frameworks
  - Template processing with `.template` file handling
  - Adapter-specific file layering system
  - TanStack adapter available in two variants: `tanstack-ui` (full dashboard) and `tanstack-headless` (API only)
  - Non-interactive mode improvements

  ### @lucid-agents/agent-kit
  - Split into adapter-specific packages
  - Core functionality moved to `@lucid-agents/agent-core`
  - Improved type definitions

  ### @lucid-agents/agent-kit-hono (NEW)
  - Hono-specific runtime implementation
  - Maintains backward compatibility with existing Hono-based agents

  ### @lucid-agents/agent-kit-tanstack (NEW)
  - TanStack Start runtime implementation
  - File-based routing support
  - Payment middleware integration
  - UI and headless variants

  ### @lucid-agents/agent-kit-identity
  - Improved validation
  - Better integration with template system

  ### @lucid-agents/agent-core (NEW)
  - Shared core functionality across adapters
  - Type definitions and utilities

  ## Migration Guide

  Existing projects using Hono will need to update imports:

  ```typescript
  // Before
  import { createAgentApp } from '@lucid-agents/agent-kit';

  // After
  import { createAgentApp } from '@lucid-agents/agent-kit-hono';
  ```

  New projects should specify adapter during creation:

  ```bash
  # Hono adapter
  bunx @lucid-agents/create-agent-kit my-agent --adapter=hono

  # TanStack with UI (full dashboard)
  bunx @lucid-agents/create-agent-kit my-agent --adapter=tanstack-ui

  # TanStack headless (API only)
  bunx @lucid-agents/create-agent-kit my-agent --adapter=tanstack-headless
  ```

## 1.2.1

### Patch Changes

- 069795f: AI agent optimization and documentation enhancement

  ### Non-Interactive CLI Arguments

  Added support for passing template arguments via CLI flags in non-interactive mode. AI coding agents can now fully automate project scaffolding:

  ```bash
  bunx @lucid-agents/create-agent-kit my-agent \
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
