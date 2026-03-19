# SIWX Hardening Implementation

## Goal
Make SIWX feature set correct, secure, adapter-consistent, and releasable per docs/siwx-prd-tdd.md.

## Constraints
- TDD: failing tests must exist before implementation
- Follow delivery order from PRD
- No new SIWX features beyond current design
- Single source of truth for types

## Key Decisions
- Hono is reference implementation for auth propagation
- `consumeNonce()` replaces check-then-write nonce pattern
- `buildSIWxMessage()` is sole canonical message builder
- Auth passed directly via `options.auth`, not transport hacks

## State
- Done:
  - [x] Codebase analysis complete
  - [x] Phase 1: Type cleanup (SIWxStorage single source of truth, PaymentsRuntime typed)
  - [x] Phase 2: Canonical signing fix (client signs buildSIWxMessage, not JSON.stringify)
  - [x] Phase 3: Atomic nonce API (consumeNonce replaces check-then-write)
  - [x] Phase 4: Fail-closed auth-only (all adapters throw on misconfigured authOnly)
  - [x] Phase 5: Handler auth propagation (Express/TanStack pass auth directly)
  - [x] Phase 6: Challenge parity (extensions.siwx + X-SIWX-EXTENSION header everywhere)
- Now: [→] Phase 7: Regression sweep
- Next: Commit

## Key Bugs Found
1. Client signs `JSON.stringify(payload)`, server verifies `buildSIWxMessage(payload)` — always fails
2. Nonce check-then-write is non-atomic (race condition)
3. No validation that SIWX runtime exists for authOnly routes
4. Express serializes auth to `x-agent-auth-context` header — never parsed by invoke()
5. TanStack stores `context.siwxAuth` but never passes to handler
6. Hono 402 uses `body.siwx`, client parser doesn't handle it

## Working Set
- Branch: ponderingdemocritus/siwx-plan
- Test command: `bun test`
- Key files: see analysis above
