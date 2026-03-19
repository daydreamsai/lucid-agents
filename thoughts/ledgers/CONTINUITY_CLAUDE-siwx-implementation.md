# SIWX Implementation Ledger

## Goal
Implement Sign-In With X (SIWX) into the Lucid Agents monorepo per docs/siwx-prd-tdd.md. Test-first approach. Success = all acceptance criteria from PRD met.

## Constraints
- TDD: write failing tests first, then implement
- SIWX owned by payments domain, not a new package
- Use bun:test for all tests
- Must support SQLite, in-memory, Postgres storage
- Adapter parity: Hono, Express, TanStack, Next
- Existing payment flows must not break

## Key Decisions
- SIWX storage is parallel to payment storage, not inside it
- Auth-only routes return 401 (per PRD recommendation)
- Resource key = full absolute URL
- Entitlements durable by default
- Implemented native SIWX verification rather than depending on @x402/extensions bump
- Client-side SIWX fetch wraps BEFORE payment fetch (try SIWX first, then pay)

## State
- Done:
  - [x] Phase 0: Codebase exploration and planning
  - [x] Phase 1: Types in @lucid-agents/types/siwx
  - [x] Phase 2: Storage interface + in-memory + SQLite + Postgres implementations
  - [x] Phase 3: Runtime config (createPaymentsRuntime, extension, entrypointHasSIWx)
  - [x] Phase 4: Verification flow (parseSIWxHeader, verifySIWxPayload, buildSIWxExtensionDeclaration)
  - [x] Phase 5: Handler auth context (invoke.ts, stream.ts accept auth param)
  - [x] Phase 6: Hono adapter integration
  - [x] Phase 7: Express adapter integration
  - [x] Phase 8: TanStack adapter integration
  - [x] Phase 9: Client-side SIWX fetch wrapper
  - [x] Phase 10: Next adapter template (CLI)
- Now: Done - all phases complete
- Remaining: None for Phase 1 scope

## Test Results (99 pass, 21 skip, 0 fail from SIWX changes)
- siwx-storage.test.ts: 28 pass, 14 skip (Postgres)
- siwx-runtime.test.ts: 13 pass
- siwx-verify.test.ts: 16 pass
- siwx-client.test.ts: 13 pass
- hono/siwx.test.ts: 7 pass, 7 skip (paid-route facilitator)
- express/siwx.test.ts: 8 pass
- tanstack/siwx.test.ts: 14 pass

## Working Set
- Branch: ponderingdemocritus/siwx-plan
- Test command: bun test packages/payments/src/__tests__/siwx-*.test.ts packages/hono/src/__tests__/siwx.test.ts packages/express/src/__tests__/siwx.test.ts packages/tanstack/src/__tests__/siwx.test.ts
