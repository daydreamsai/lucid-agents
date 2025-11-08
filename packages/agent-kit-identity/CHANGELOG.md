# @lucid-agents/agent-kit-identity

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
