---
"@lucid-agents/core": minor
"@lucid-agents/types": minor
"@lucid-agents/payments": minor
"@lucid-agents/http": minor
"@lucid-agents/wallet": minor
"@lucid-agents/identity": minor
"@lucid-agents/a2a": minor
---

Deprecate global config, cleanup types, improve A2A discovery, and add examples package

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

