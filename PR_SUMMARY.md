# feat: Wallets SDK and Preparation for Bidirectional A2A

## Overview

This PR introduces a comprehensive wallet SDK, refactors the type system to eliminate circular dependencies, improves the build system, and adds extensive code quality improvements. This is a major architectural change that **prepares the foundation** for bidirectional agent-to-agent (A2A) communication by providing the wallet infrastructure needed for agents to sign and verify messages when communicating with each other.

## New Features

### Wallet Package (`@lucid-agents/wallet`)

A new package providing wallet connectors and signing infrastructure:

- **Local Wallet Connector** (`LocalEoaWalletConnector`)
  - Supports private key-based signing
  - Handles message signing and typed data signing (EIP-712)
  - Supports transaction signing for contract interactions
  - Automatic metadata extraction from challenge responses

- **Server Orchestrator Wallet Connector** (`ServerOrchestratorWalletConnector`)
  - Remote wallet signing via server orchestrator API
  - Bearer token authentication
  - Challenge-based signing flow
  - Supports CAIP-2 chain identification

- **Wallet Factory** (`createAgentWallet`)
  - Unified API for creating wallet handles
  - Supports both local and server-backed wallets
  - Environment-based configuration via `walletsFromEnv()`

- **Private Key Signer** (`createPrivateKeySigner`)
  - Wraps viem's `privateKeyToAccount` for consistent interface
  - Full support for message, typed data, and transaction signing
  - Type-safe integration with viem

### Payment Utilities

- **Payment Detection**: `detectExplicitPricing()` - Identifies explicit pricing in entrypoint definitions
- **Payment Resolution**: `resolveActivePayments()` - Resolves active payment configurations
- **Payment Evaluation**: `evaluatePaymentRequirement()` - Determines payment requirements for entrypoints

### Runtime API Enhancements

- Enhanced runtime management with wallet integration
- Improved entrypoint registration and manifest generation
- Better support for streaming and standard entrypoints
- **Simplified payments runtime architecture** - Payments runtime now returned directly from `createPaymentsRuntime()` with all methods included (`config`, `isActive`, `requirements`, `activate`)
- **Direct runtime exposure** - `payments` and `wallets` exposed directly without unnecessary wrappers

### Shared Adapter Return Type

- **`CreateAgentAppReturn<TApp>`** - Generic return type for adapter-specific `createAgentApp` functions
  - Moved to `@lucid-agents/types/core` for reuse across adapters
  - Generic over app type to support different frameworks (Hono, Express, etc.)
  - Provides consistent return structure: `{ app, runtime, agent, addEntrypoint, config }`
  - Used by both Hono and Express adapters with their specific app types

### Code Structure Principles

Added comprehensive code structure principles to `AGENTS.md`:

- **Single Source of Truth** - One type definition per concept
- **Encapsulation at the Right Level** - Domain complexity belongs in owning package
- **Direct Exposure** - Expose runtimes directly without wrappers
- **Consistency** - Similar concepts follow same patterns
- **Public API Clarity** - Include needed methods in public types
- **Simplicity Over Indirection** - Avoid unnecessary complexity
- **Domain Ownership** - Each package owns its complexity
- **No Premature Abstraction** - Keep it simple until needed

## Breaking Changes

### Configuration Shape

**Before:**

```typescript
{
  wallet: {
    type: 'local',
    privateKey: '0x...'
  }
}
```

**After:**

```typescript
{
  wallets: {
    agent: {
      type: 'local',
      privateKey: '0x...'
    },
    developer: {
      type: 'local',
      privateKey: '0x...'
    }
  }
}
```

### Type Exports

**Removed re-exports** - Types from `@lucid-agents/types` are no longer re-exported from individual packages. Import directly:

**Before:**

```typescript
import { AgentRuntime } from '@lucid-agents/core';
```

**After:**

```typescript
import type { AgentRuntime } from '@lucid-agents/types/core';
```

### TypedDataPayload API

Changed from snake_case to camelCase to align with viem:

**Before:**

```typescript
{
  primary_type: 'Mail',
  typed_data: { ... }
}
```

**After:**

```typescript
{
  primaryType: 'Mail',
  typedData: { ... }
}
```

### ChallengeSigner Interface

Made `payload` and `scopes` optional to match `AgentChallenge`:

**Before:**

```typescript
signChallenge(challenge: {
  payload: unknown;  // required
  scopes: string[];  // required
  // ...
})
```

**After:**

```typescript
signChallenge(challenge: {
  payload?: unknown;  // optional
  scopes?: string[];  // optional
  // ...
})
```

### Adapter Return Types

**Hono and Express adapters now return `runtime` property:**

**Before:**

```typescript
const { app, agent, addEntrypoint, config } = createAgentApp(...);
// runtime was missing from return type
```

**After:**

```typescript
const { app, runtime, agent, addEntrypoint, config } = createAgentApp(...);
// runtime is now included in CreateAgentAppReturn<TApp>
```

### Payments Runtime Simplification

**Payments runtime now includes `activate` method in public API:**

**Before:**

```typescript
// Internal PaymentsRuntimeInternal with activate
// Public PaymentsRuntime without activate
// Core runtime wrapped payments to add requirements
```

**After:**

```typescript
// Single PaymentsRuntime type with all methods
type PaymentsRuntime = {
  config: PaymentsConfig;
  isActive: boolean;
  requirements: (entrypoint, kind) => RuntimePaymentRequirement;
  activate: (entrypoint) => void; // Now public
};

// createPaymentsRuntime returns complete runtime
const payments = createPaymentsRuntime(...);
// Core runtime uses directly: return { payments };
```

## Architecture & Refactoring

### Payments Runtime Simplification

**Eliminated Internal/External Type Split:**

- Removed `PaymentsRuntimeInternal` type
- `createPaymentsRuntime()` now returns public `PaymentsRuntime` type directly
- All methods (`config`, `isActive`, `requirements`, `activate`) included in single type
- Core runtime no longer wraps payments - exposes directly like `wallets`

**Simplified Core Runtime:**

- Removed wrapping logic for payments runtime
- Direct exposure: `return { wallets, payments }`
- Payments package owns all payments complexity
- Follows same pattern as wallets for consistency

### Type System Consolidation

**Eliminated Circular Dependencies:**

- Moved all shared types to `@lucid-agents/types` package
- Organized types by domain: `core`, `payments`, `wallets`, `identity`
- Removed runtime dependencies between `core`, `payments`, and `identity`
- Fixed build order: `types` → `wallet` → `payments` → `identity` → `core` → adapters

**Type Organization:**

```
@lucid-agents/types/
├── core/          # AgentRuntime, AgentCard, Manifest, AP2 types, CreateAgentAppReturn
├── payments/      # PaymentRequirement, RuntimePaymentRequirement, PaymentsRuntime
├── wallets/       # WalletConnector, LocalEoaSigner, TypedDataPayload
└── identity/      # TrustConfig, RegistrationEntry
```

**Comprehensive Type Moves:**

**From `@lucid-agents/core` to `@lucid-agents/types/core`:**

- `AgentRuntime` - Core runtime interface
- `AgentCard` - Agent manifest card structure
- `AgentCardWithEntrypoints` - Manifest with entrypoints
- `Manifest` - Full manifest structure
- `PaymentMethod` - Payment method definitions
- `AgentCapabilities` - Agent capability flags
- `AP2Config` - AP2 payment configuration
- `AP2Role` - AP2 role definitions
- `AP2ExtensionDescriptor` - AP2 extension metadata
- `AP2ExtensionParams` - AP2 extension parameters
- `AgentMeta` - Agent metadata
- `AgentContext` - Entrypoint handler context
- `Usage` - Usage metrics
- `EntrypointDef` - Entrypoint definition structure
- `AgentKitConfig` - Main configuration type
- `CreateAgentAppReturn<TApp>` - Generic adapter return type (new)

**From `@lucid-agents/wallet` to `@lucid-agents/types/wallets`:**

- `WalletConnector` - Wallet connector interface
- `ChallengeSigner` - Challenge signing interface
- `WalletMetadata` - Wallet metadata structure
- `LocalEoaSigner` - Local EOA signer interface (with `signTransaction` support)
- `TypedDataPayload` - Typed data payload (aligned with viem camelCase)
- `AgentChallenge` - Challenge structure
- `AgentChallengeResponse` - Challenge response wrapper
- `AgentWalletHandle` - Wallet handle interface
- `AgentWalletKind` - Wallet kind type
- `AgentWalletConfig` - Wallet configuration
- `DeveloperWalletConfig` - Developer wallet configuration
- `WalletsConfig` - Wallets configuration structure
- `LocalWalletOptions` - Local wallet options
- `LocalWalletWithPrivateKeyOptions` - Private key wallet options
- `LocalWalletWithSignerOptions` - Custom signer wallet options
- `LucidWalletOptions` - Lucid wallet options
- `AgentWalletFactoryOptions` - Factory options
- `FetchExecutor` - Fetch function type
- `LocalWalletMetadataOptions` - Local wallet metadata options

**From `@lucid-agents/payments` to `@lucid-agents/types/payments`:**

- `PaymentRequirement` - Payment requirement structure
- `RuntimePaymentRequirement` - Runtime payment requirement with Response
- `PaymentsConfig` - Payment configuration
- `EntrypointPrice` - Entrypoint pricing structure
- `SolanaAddress` - Solana address type
- `PaymentsRuntime` - Payments runtime type (now includes `activate` method)

**From `@lucid-agents/identity` to `@lucid-agents/types/identity`:**

- `TrustConfig` - Trust configuration
- `RegistrationEntry` - Registration entry structure
- `TrustModel` - Trust model type

**Type Alignment Improvements:**

- `TypedDataPayload`: Changed `primary_type` → `primaryType`, `typed_data` → `typedData` (camelCase to match viem)
- `ChallengeSigner`: Made `payload` and `scopes` optional to match `AgentChallenge`
- `LocalEoaSigner`: Added `signTransaction` method for contract writes
- `AP2ExtensionDescriptor`: Uses string literal instead of `typeof AP2_EXTENSION_URI` to avoid type-only import issues
- `CreateAgentAppReturn<TApp>`: Generic type for adapter return values, supports any app framework
- `PaymentsRuntime`: Now includes `activate` method in public type (was previously internal)

### Build System Improvements

**Fixed Build Order:**

- Corrected topological sort based on actual runtime dependencies
- Added `build:clean` command for fresh builds
- Added `justfile` command: `build-all-clean` for convenient clean builds

**AP2 Constants:**

- `AP2_EXTENSION_URI` kept in `packages/core/src/manifest/ap2.ts` (runtime constant)
- `AP2ExtensionDescriptor` type uses string literal instead of `typeof AP2_EXTENSION_URI` in types package
- Prevents type-only import issues while maintaining runtime value access

**Build Order:**

1. `@lucid-agents/types` (no dependencies)
2. `@lucid-agents/wallet` (depends on types)
3. `@lucid-agents/payments` (depends on types only)
4. `@lucid-agents/identity` (depends on types only)
5. `@lucid-agents/core` (depends on all extensions)
6. Adapters (depend on core)
7. CLI (no internal dependencies)

### Package Dependencies

**Removed Circular Dependencies:**

- `@lucid-agents/payments` no longer depends on `@lucid-agents/core` (was causing circular dependency)
- `@lucid-agents/identity` no longer depends on `@lucid-agents/core` (was causing circular dependency)
- Both now only depend on `@lucid-agents/types` for type definitions
- `@lucid-agents/payments` removed `@lucid-agents/wallet` dependency (uses types only)
- All packages now use type-only imports from `@lucid-agents/types` to avoid runtime circular dependencies

**Dependency Graph (Before):**

```
core ←→ payments (circular!)
core ←→ identity (circular!)
payments → wallet
identity → wallet
```

**Dependency Graph (After):**

```
types (no dependencies)
  ↓
wallet → types
payments → types
identity → types
  ↓
core → types, payments, identity, wallet
  ↓
adapters → core
```

This clean dependency graph ensures:

- No circular dependencies
- Correct build order
- Type-only imports prevent runtime circular dependencies
- Clear separation of concerns

## Code Quality Improvements

### Removed Complexity

- **Removed `stableJsonStringify`** - Completely removed complex stringification logic
  - Simplified `resolveChallengeMessage()` to only look for explicit message fields
  - No longer attempts to stringify arbitrary objects
  - Fails early with clear error messages if no signable message found
  - Removed unnecessary complexity, type safety issues, and maintenance burden
  - Function was removed entirely from codebase (not just fixed)

- **Removed `ChallengeNormalizationOptions`** - No longer needed
  - Removed unused interface and default options
  - Simplified `normalizeChallenge()` signature

- **Removed Payments Runtime Wrapping** - Eliminated unnecessary complexity
  - Removed internal/external type split (`PaymentsRuntimeInternal`)
  - Removed wrapping logic in core runtime
  - Payments package now returns complete runtime directly
  - Core runtime exposes payments directly like wallets

- **Extracted Duplicated Logic** - DRY improvements
  - Extracted `resolveRequiredChainId()` helper in identity package
  - Eliminates duplication between bootstrap and registry client creation
  - Preserves existing error messages with optional context parameter

### Import/Export Cleanup

- **Removed `.js` extensions** from TypeScript source imports
  - TypeScript handles module resolution, no need for `.js` extensions in source
  - Cleaner imports: `from './base-connector'` instead of `from './base-connector.js'`

- **Removed unnecessary re-exports** - Types should be imported directly from `@lucid-agents/types`
  - Consumers import types directly: `import type { AgentRuntime } from '@lucid-agents/types/core'`
  - No more re-exporting types from individual packages

- **Cleaned up internal imports** - All files now import types directly from source
  - Internal files import from `@lucid-agents/types` packages
  - Consistent import patterns across all packages

### Type Safety Improvements

- **Fixed `signTransaction` support** - Added to `LocalEoaSigner` interface
  - Enables contract writes with local wallets
  - Properly implemented in `createPrivateKeySigner`
  - Clear error messages when transaction signing is not supported

- **Aligned with viem types** - `TypedDataPayload` now matches viem's `signTypedData` signature
  - Changed from `primary_type` (snake_case) to `primaryType` (camelCase)
  - Removed type assertions (`as never`) in `private-key-signer.ts`
  - Direct compatibility with viem accounts
  - Better type safety with `Parameters<typeof account.signTypedData>[0]` for `signMessage`

- **Fixed adapter return types** - All adapters now properly expose `runtime` property
  - Removed stale `.d.ts` files in `src/` directories that were overriding generated types
  - Hono and Express adapters now use shared `CreateAgentAppReturn<TApp>` type
  - Type definitions correctly generated from source code

- **Fixed TypeScript errors in CLI templates** - Added fallback values for `process.env` variables
  - All adapter snippets now handle `undefined` environment variables gracefully
  - Prevents type errors: `process.env.AGENT_NAME || "Agent"` instead of `process.env.AGENT_NAME`

- **Simplified Payments Runtime Types** - Single source of truth
  - Removed `PaymentsRuntimeInternal` type
  - Single `PaymentsRuntime` type with all methods
  - `activate` method now part of public API

### Error Handling

- **Early validation** - Checks for signable content before attempting to sign
- **Clear error messages** - Better error messages when signing fails
- **No silent failures** - Won't sign "null" or empty objects
- **Consistent error messages** - `resolveRequiredChainId` preserves context-specific errors

## Package Changes

### New Package: `@lucid-agents/wallet`

**Dependencies:**

- `@lucid-agents/types` (workspace)
- `viem ^2.38.5`

**Exports:**

- `createAgentWallet()` - Wallet factory
- `LocalEoaWalletConnector` - Local wallet connector
- `ServerOrchestratorWalletConnector` - Server-backed wallet connector
- `createPrivateKeySigner()` - Private key signer factory
- `walletsFromEnv()` - Environment-based wallet loading
- `normalizeChallenge()` - Challenge normalization utilities
- `extractSignature()`, `extractWalletMetadata()` - Helper functions

### Updated Packages

**`@lucid-agents/core`:**

- Removed all type re-exports (types now imported directly from `@lucid-agents/types/core`)
- Removed local type definitions that were moved to types package
- Updated all internal imports to use types from `@lucid-agents/types/core`
- Wallet integration via runtime
- `AP2_EXTENSION_URI` constant kept in core (runtime value, not type)
- Updated documentation to reflect new `CreateAgentAppReturn<TApp>` type
- **Simplified payments runtime exposure** - No longer wraps payments, exposes directly

**`@lucid-agents/payments`:**

- Removed dependency on `@lucid-agents/core` (was causing circular dependency)
- Removed type re-exports (`PaymentRequirement`, `RuntimePaymentRequirement`)
- Uses types from `@lucid-agents/types/payments` and `@lucid-agents/types/core`
- Wallet integration for signing via `AgentRuntime` type from types package
- Removed `@lucid-agents/wallet` dependency (uses types only)
- **Returns complete PaymentsRuntime** - Includes all methods (`config`, `isActive`, `requirements`, `activate`)
- **No internal type split** - Single `PaymentsRuntime` type

**`@lucid-agents/identity`:**

- Removed dependency on `@lucid-agents/core` (was causing circular dependency)
- Removed type re-exports
- Uses types from `@lucid-agents/types/identity` and `@lucid-agents/types/wallets`
- Full wallet integration for identity registration
- Updated to use `AgentWalletHandle` and `LocalEoaSigner` from types package
- **Extracted `resolveRequiredChainId` helper** - DRY improvement, eliminates duplication

**`@lucid-agents/wallet`:**

- Removed type re-exports (types now in `@lucid-agents/types/wallets`)
- Removed local type definitions that were moved to types package
- Updated internal imports to use types from `@lucid-agents/types/wallets`
- Removed `.js` extensions from all imports
- Removed `stableJsonStringify` function entirely
- Removed `ChallengeNormalizationOptions` interface

**`@lucid-agents/types`:**

- New shared types package (consolidates all shared types)
- Organized by domain: `core/`, `payments/`, `wallets/`, `identity/`
- No runtime dependencies (types only)
- Enables type-only imports to break circular dependencies
- Added `CreateAgentAppReturn<TApp>` generic type for adapter return values
- **PaymentsRuntime includes `activate` method** - Complete public API

**`@lucid-agents/hono`:**

- Updated to use `CreateAgentAppReturn<Hono>` from `@lucid-agents/types/core`
- Removed local `CreateAgentAppReturn` type definition
- Removed stale `.d.ts` files from `src/` directory
- Return type now correctly includes `runtime` property

**`@lucid-agents/express`:**

- Updated to use `CreateAgentAppReturn<Express>` from `@lucid-agents/types/core`
- Return type now correctly includes `runtime` property

**`@lucid-agents/cli`:**

- Updated all adapter snippets to include fallback values for `process.env` variables
- Prevents TypeScript errors when environment variables are undefined
- All adapters (hono, express, tanstack-ui, tanstack-headless, next) updated

## Build & Development

### New Commands

```bash
# Clean and build all packages
bun run build:clean
# or
just build-all-clean
```

### Build Process

- Correct topological sort based on package dependencies
- Parallel builds where possible
- Type checking before builds
- Clean builds available for fresh starts
- Removed stale `.d.ts` files that were interfering with type generation

## Testing

- Comprehensive test coverage for wallet connectors
- Tests for local and server-backed wallets
- Challenge signing tests
- Transaction signing tests
- Type safety tests
- End-to-end identity example verification
- Payments runtime activation tests
- Runtime exposure tests

## Migration Guide

### 1. Update Configuration

```typescript
// Before
const config = {
  wallet: {
    type: 'local',
    privateKey: process.env.PRIVATE_KEY,
  },
};

// After
const config = {
  wallets: {
    agent: {
      type: 'local',
      privateKey: process.env.AGENT_PRIVATE_KEY,
    },
    developer: {
      type: 'local',
      privateKey: process.env.DEVELOPER_PRIVATE_KEY,
    },
  },
};
```

### 2. Update Type Imports

```typescript
// Before
import { AgentRuntime, WalletConnector } from '@lucid-agents/core';

// After
import type { AgentRuntime } from '@lucid-agents/types/core';
import type { WalletConnector } from '@lucid-agents/types/wallets';
```

### 3. Update TypedData Usage

```typescript
// Before
const typedData = {
  primary_type: 'Mail',
  typed_data: { ... }
};

// After
const typedData = {
  primaryType: 'Mail',
  typedData: { ... }
};
```

### 4. Use Wallet Package

```typescript
// Before
// No wallet package

// After
import { createAgentWallet, walletsFromEnv } from '@lucid-agents/wallet';

const wallets = walletsFromEnv();
// or
const wallet = createAgentWallet({
  type: 'local',
  privateKey: '0x...',
});
```

### 5. Access Runtime from Adapters

```typescript
// Before
const { app, agent, addEntrypoint, config } = createAgentApp(...);
// runtime was not available

// After
const { app, runtime, agent, addEntrypoint, config } = createAgentApp(...);
// runtime is now included in the return type
```

### 6. Use Payments Runtime Directly

```typescript
// Before
// Payments runtime was wrapped, activate was internal

// After
// Payments runtime is exposed directly with all methods
const { runtime } = createAgentApp(...);
if (runtime.payments) {
  runtime.payments.activate(entrypoint); // Now public API
  const requirement = runtime.payments.requirements(entrypoint, 'invoke');
}
```

## Bug Fixes

- Fixed circular dependency between `core` and `payments`/`identity`
- Fixed build order causing build failures
- Fixed transaction signing for local wallets (enables identity registration)
- Fixed `TypedDataPayload` alignment with viem (camelCase, removed type assertions)
- Fixed challenge message resolution (no longer signs empty/null values)
- Fixed type inconsistencies between `ChallengeSigner` and `AgentChallenge` (made `payload` and `scopes` optional)
- Fixed missing `runtime` property in adapter return types (removed stale `.d.ts` files)
- Fixed TypeScript errors in CLI-generated templates (added fallback values for `process.env` variables)
- Fixed payments runtime type split (removed `PaymentsRuntimeInternal`, unified to single type)
- Fixed payments runtime wrapping (removed unnecessary wrapping in core runtime)
- Fixed duplicated chainId resolution logic (extracted `resolveRequiredChainId` helper)

## Documentation

- Added wallet package documentation
- Updated type documentation
- Added migration guide
- Updated examples with new wallet API
- Updated `AGENTS.md` to reflect new `CreateAgentAppReturn<TApp>` type structure
- **Added Code Structure Principles section** - Comprehensive guide on code organization principles
- Updated runtime documentation to reflect simplified payments architecture

## Code Review Notes

### Areas of Focus

1. **Type System** - Verify all types are correctly moved and imports updated
2. **Build Order** - Confirm build order matches runtime dependencies
3. **Wallet Integration** - Test wallet connectors with real scenarios
4. **Breaking Changes** - Ensure migration guide covers all breaking changes
5. **Type Safety** - Verify no `any` types or unsafe assertions remain
6. **Adapter Return Types** - Verify `runtime` property is accessible in all adapters
7. **CLI Templates** - Verify generated code handles undefined environment variables
8. **Payments Runtime** - Verify payments runtime is exposed correctly and `activate` is accessible
9. **Code Structure** - Verify code follows new structure principles

### Known Limitations

- Server orchestrator wallets don't support transaction signing (by design)
- Local wallets must be created with either a private key or a custom signer implementation (signing is fully implemented once created)
- Challenge-based signing requires proper challenge format

## Checklist

- [x] New wallet package added
- [x] Types consolidated to shared package
- [x] Circular dependencies eliminated
- [x] Build order fixed
- [x] Breaking changes documented
- [x] Migration guide provided
- [x] Tests updated
- [x] Documentation updated
- [x] Code quality improvements
- [x] Type safety improvements
- [x] Adapter return types fixed
- [x] CLI templates updated with fallback values
- [x] Stale `.d.ts` files removed
- [x] Payments runtime simplified
- [x] Code structure principles documented
- [x] Duplicated logic extracted

## Summary

This PR represents a major architectural improvement:

- **New wallet SDK** enables proper wallet integration
- **Eliminated circular dependencies** for better maintainability
- **Improved type safety** with consolidated types
- **Better build system** with correct dependency ordering
- **Cleaner codebase** with removed complexity
- **Fixed adapter return types** with shared generic type
- **Improved CLI templates** with proper TypeScript handling
- **Simplified payments runtime** - Single type, direct exposure, no wrapping
- **Code structure principles** - Comprehensive guide for future development
- **DRY improvements** - Extracted duplicated logic

The changes provide the foundational wallet infrastructure needed for future bidirectional A2A communication, while maintaining backward compatibility where possible and providing clear migration paths for breaking changes. The wallet SDK enables agents to sign challenges, messages, and transactions, which will be essential for secure agent-to-agent interactions in future releases. The simplified runtime architecture and code structure principles ensure the codebase remains maintainable and easy to understand as it grows.
