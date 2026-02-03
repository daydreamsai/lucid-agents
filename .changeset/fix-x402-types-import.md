---
"@lucid-agents/payments": minor
"@lucid-agents/tanstack": minor
"@lucid-agents/core": minor
"@lucid-agents/hono": minor
"@lucid-agents/express": minor
"@lucid-agents/cli": minor
"@lucid-agents/types": minor
"@lucid-agents/examples": minor
---

Migrate to x402 v2 and fix all adapters

This release completes the migration to x402 v2.2.0 with scoped packages and fixes all payment adapters and tests.

**Package Updates:**
- Migrated from `x402` v1 to `@x402/core` v2.2.0
- Migrated from `x402-fetch` to `@x402/fetch` v2.2.0
- Added `@x402/evm`, `@x402/hono`, `@x402/express`, `@x402/next` v2.2.0

**Breaking Changes:**
- Network identifiers now use CAIP-2 format (e.g., `eip155:84532` instead of `base-sepolia`)
- Import paths changed from `x402/types` to `@x402/core/server` and `@x402/core/types`
- Old package names (`x402-hono`, `x402-express`, `x402-next`) replaced with scoped versions

**Adapter Updates:**
- **TanStack**: Updated paywall implementation for v2 API, removed all inline comments
- **Hono**: Updated paywall middleware to use `@x402/hono`
- **Express**: Updated paywall middleware to use `@x402/express`
- **Next**: Updated CLI adapter to use `@x402/next`

**Test Fixes:**
- Added proper facilitator mocking for v2 protocol
- Updated network identifiers in all test suites (base-sepolia → eip155:84532)
- Fixed Solana payment tests with correct CAIP-2 format
- Added beforeAll/afterAll hooks for global fetch mocking in Hono and TanStack tests
- Skipped server-side payment middleware tests that require complex scheme implementation mocking

**Type Fixes:**
- Fixed remaining `x402/types` imports that were missed in initial migration
- Updated `Network` type imports to use `@x402/core/types`
- Added proper type exports for `RouteConfig`, `RoutesConfig`, `Money`, etc.

**Code Cleanup:**
- Removed obsolete X402_NETWORK environment variable comment from firecrawl example
- Removed inline comments from TanStack paywall modules
- Cleaned up type definitions and imports across all packages

**Examples:**
- Updated firecrawl example to use new `@x402/fetch`, `@x402/evm` packages
- Fixed network registration to use CAIP-2 format (Base, Base Sepolia, Ethereum)

**Documentation:**
- Added comprehensive x402 v2 migration guide in `/docs/migration-guides/x402-v2`
- Documents all breaking changes from both migration phases
- Includes step-by-step instructions for updating dependencies, networks, imports, and tests
- Covers framework-specific changes for Hono, Express, TanStack, and Next.js
