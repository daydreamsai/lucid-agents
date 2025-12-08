# @lucid-agents/wallet

## 0.5.3

### Patch Changes

- Updated dependencies [8b1afb7]
  - @lucid-agents/types@1.5.3

## 0.5.2

### Patch Changes

- Updated dependencies [222485f]
  - @lucid-agents/types@1.5.2

## 0.5.1

### Patch Changes

- Updated dependencies [2e95dcf]
  - @lucid-agents/types@1.5.1

## 0.5.0

### Minor Changes

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

## 0.2.1

### Patch Changes

- Updated dependencies [ae09320]
  - @lucid-agents/types@1.3.0

## 0.2.0

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
