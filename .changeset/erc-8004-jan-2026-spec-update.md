---
"@lucid-agents/identity": major
---

ERC-8004 January 2026 Specification Update

BREAKING CHANGES:

- Reputation Registry `giveFeedback()`: Removed `feedbackAuth`, `expiry`, `indexLimit` parameters. Added `endpoint` parameter. Tags are now `string` instead of `bytes32` or `Hex`.
- Identity Registry: `tokenURI` renamed to `agentURI` throughout. `register()` now takes `agentURI` instead of `tokenURI`. `tokenURI()` function still exists for ERC-721 compatibility but should be treated as `agentURI` conceptually.
- Validation Registry: Deprecated and removed from default client creation. Under active development, will be updated in follow-up spec update later this year. **Breaking changes**: Function names changed (`createRequest` → `validationRequest`, `submitResponse` → `validationResponse`). Tag types changed from `bytes32`/`Hex` to `string` in `getSummary()`, `getValidationStatus()`, and `validationResponse()`.
- Contract Addresses: Only ETH Sepolia is deployed with new Jan 2026 addresses. Other chains are commented out until new contracts are deployed.

NEW FEATURES:

- Added `setAgentURI()` function to IdentityRegistryClient for updating agent URIs after registration
- Added `getVersion()` function to all registry clients (Identity, Reputation, Validation) for checking contract versions
- Added validation to block reserved `agentWallet` metadata key in `setMetadata()` with clear error message

IMPROVEMENTS:

- Updated `getAllFeedback()` to handle new `feedbackIndexes` return value from contract
- Updated all feedback tag types from `bytes32`/`Hex` to `string` for better usability
- Improved type safety with correct return types for all registry functions
- `readAllFeedback()` now returns `feedbackIndexes` as second element (not first as spec initially indicated, matching actual contract behavior)

MIGRATION:

See MIGRATION.md for detailed migration guide and code examples.

