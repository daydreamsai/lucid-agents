# PRD/TDD: SIWX Hardening and Adapter Parity

Status: Implemented
Owner: SDK
Last Updated: 2026-03-19
Scope: `@lucid-agents/types`, `@lucid-agents/payments`, `@lucid-agents/http`, `@lucid-agents/hono`, `@lucid-agents/express`, `@lucid-agents/tanstack`, Next adapter scaffolding

## Summary

This document defines the remediation plan for the current Sign-In With X (SIWX) implementation. The branch already introduces the main primitives, but review found several correctness and security defects:

1. The bundled SIWX client signs the wrong message format.
2. Nonce replay protection is not atomic.
3. `authOnly` routes can fail open when SIWX runtime state is missing.
4. Express and TanStack verify SIWX but drop authenticated wallet context before handler execution.
5. Hono emits a 402 SIWX challenge in a shape the official client does not parse.
6. The new SIWX types violate the monorepo single-source-of-truth rule.

The goal of this work is not to expand SIWX scope. The goal is to make the existing SIWX feature set correct, secure, adapter-consistent, and releasable.

## Problem Statement

The current implementation creates a dangerous gap between declared behavior and actual runtime behavior:

- Production SIWX retries will fail cryptographic verification.
- Replay prevention can be bypassed by concurrent requests.
- A developer can declare `siwx: { authOnly: true }` and accidentally ship an unprotected route.
- Some adapters grant access but never expose `ctx.auth` to user code.
- Client-side SIWX retry works differently across adapters.
- Public types are duplicated and partially hidden behind `unknown`, making adapter code rely on casts.

This is too much surface area to treat as patch-level cleanup. We need a deliberate remediation plan with explicit invariants and a test-first delivery sequence.

## Goals

- Make SIWX cryptographic verification work in production.
- Make replay protection atomic across all storage backends.
- Make `authOnly` routes fail closed.
- Guarantee that successful SIWX verification always reaches handler context.
- Standardize SIWX challenge declaration across adapters.
- Restore type ownership and public API clarity.
- Ship the fixes with adapter-level parity tests and no hidden casts.

## Non-Goals

- Adding new SIWX features beyond the current design.
- Introducing a generic auth framework.
- Adding session storage, JWTs, or cookies.
- Designing entitlement hierarchies across related resources.
- Expanding non-HTTP SIWX support.

## Users

- SDK maintainers who need a safe release path for SIWX.
- Agent developers who rely on `ctx.auth` and adapter parity.
- Template users who expect generated clients and routes to work consistently.
- Security reviewers who need replay protection and fail-closed route behavior.

## Product Requirements

### PR-1: Canonical signing and verification

The SDK must use one canonical message format for SIWX signing and verification.

Acceptance criteria:

- The client signs the exact message string that the server verifies.
- The canonical message builder lives in one place.
- Tests cover both helper-generated payloads and real signature verification.
- `skipSignatureVerification` remains test-only behavior and is not required for normal flows.

### PR-2: Atomic nonce consumption

Replay protection must be atomic, not check-then-write.

Acceptance criteria:

- The storage contract exposes one operation for nonce consumption.
- A used nonce cannot be accepted twice, even under concurrent requests.
- SQLite, Postgres, and in-memory backends all reject duplicate nonce consumption.
- Verification code does not separately call `hasUsedNonce()` before writing.

### PR-3: Fail-closed `authOnly` routing

Declaring `siwx: { authOnly: true }` must never create a public route by mistake.

Acceptance criteria:

- App construction throws or refuses route registration when `authOnly` is requested without usable SIWX runtime state.
- This behavior is identical across Hono, Express, TanStack, and Next scaffolding.
- There is no silent boolean return path that leaves the route mounted and unprotected.

### PR-4: Guaranteed handler auth propagation

Any request admitted via SIWX must deliver typed auth data to user handlers.

Acceptance criteria:

- `ctx.auth` is populated for entitlement-based and auth-only access.
- Express, Hono, TanStack, and Next all use the same shape.
- No adapter relies on synthetic headers that the HTTP layer does not parse.
- Streaming handlers receive the same auth context as invoke handlers.

### PR-5: Standard challenge declaration

All adapters must emit the SIWX challenge in a single supported format.

Acceptance criteria:

- `402` responses expose SIWX through `X-SIWX-EXTENSION` and `extensions.siwx`.
- `401` auth failures use a predictable JSON structure and may also include the header when a retry is possible.
- The Lucid SIWX client helper can parse challenge responses from every maintained adapter with no adapter-specific logic.

### PR-6: Single source of truth types

SIWX public types must follow the root architecture rules.

Acceptance criteria:

- `SIWxStorage` is defined once in `@lucid-agents/types`.
- Payments imports and re-exports that type instead of redefining it.
- `PaymentsRuntime` exposes concrete SIWX types instead of `unknown`.
- Adapter code does not cast runtime SIWX fields back to a hidden type.

## Technical Decisions

### TD-1: One canonical message builder

`buildSIWxMessage(payload)` in `@lucid-agents/payments` becomes the sole canonical builder.

Implementation rule:

- `wrapFetchWithSIWx()` must sign `buildSIWxMessage(payload)`.
- Verification must continue using the same builder.
- No code path may sign `JSON.stringify(payload)`.

### TD-2: Replace check-then-write nonce API

The storage interface must change from:

```ts
hasUsedNonce(nonce): Promise<boolean>
recordNonce(nonce, metadata): Promise<void>
```

to:

```ts
consumeNonce(
  nonce: string,
  metadata?: { resource?: string; address?: string; expiresAt?: number }
): Promise<'consumed' | 'already_used'>
```

Implementation rule:

- `verifySIWxPayload()` calls `consumeNonce()` once, after payload validation and before granting access.
- Duplicate nonce consumption must return `already_used`, not overwrite prior metadata.
- Existing tests for `hasUsedNonce` / `recordNonce` should be migrated or narrowed to internal backend helpers if needed.

### TD-3: Runtime construction must fail closed

`authOnly` is a security declaration, not a best-effort hint.

Implementation rule:

- Route registration must validate SIWX availability before mounting auth-only handlers.
- If a runtime lacks `siwxConfig.enabled` or usable storage, route registration throws with a clear error.
- Adapters must not treat missing SIWX middleware as a non-fatal condition for auth-only routes.

### TD-4: Adapters should pass auth directly, not through transport hacks

The `@lucid-agents/http` package already accepts `options.auth` in `invoke()` and `stream()`. Adapters should call those APIs directly.

Implementation rule:

- Hono already follows the right pattern and becomes the reference implementation.
- Express should stop serializing auth into `x-agent-auth-context`.
- TanStack should stop widening its public handler type without actually threading auth through.
- Next should follow the same direct `auth` passing pattern.

### TD-5: Shared challenge builder and response contract

The payments package owns the response shape for SIWX challenge emission.

Implementation rule:

- Add one helper that enriches a `402` or `401` response with:
  - `X-SIWX-EXTENSION`
  - `extensions.siwx` for payment challenges
  - `error.siwx` when the client needs retry metadata on auth failures
- Adapters must call the helper rather than constructing ad hoc response shapes.

### TD-6: Public API clarity

The root `AGENTS.md` rules apply directly here.

Implementation rule:

- `SIWxStorage` is defined in `@lucid-agents/types/siwx`.
- `PaymentsRuntime.siwxStorage` is typed as `SIWxStorage`.
- `PaymentsRuntime.siwxConfig` is typed as `SIWxConfig`.
- Remove duplicate local interfaces and `unknown` placeholders.

## Workstreams

### Workstream A: Type and runtime cleanup

Packages:

- `packages/types`
- `packages/payments`

Tasks:

- Remove duplicate `SIWxStorage` declaration from payments.
- Export concrete SIWX types from `@lucid-agents/types`.
- Update `PaymentsRuntime` to expose typed `siwxStorage` and `siwxConfig`.
- Update payments runtime construction to use the shared types directly.

Exit criteria:

- No adapter code needs a type cast for `siwxStorage`.
- The SIWX type surface follows single-source-of-truth rules.

### Workstream B: Cryptographic correctness

Packages:

- `packages/payments`

Tasks:

- Change client signing to use `buildSIWxMessage()`.
- Keep payload serialization only for the header body, not for the signed message.
- Add end-to-end verification tests using an actual signer.

Exit criteria:

- A client-generated SIWX header verifies successfully when entitlement exists.
- The same test fails if the message string is altered.

### Workstream C: Atomic replay protection

Packages:

- `packages/payments`

Tasks:

- Replace nonce API with atomic consumption.
- Update SQLite and Postgres to rely on uniqueness constraints without overwrite semantics.
- Update in-memory storage to reject duplicates deterministically.
- Update verification flow to call the new method exactly once.

Exit criteria:

- Concurrent attempts to consume the same nonce produce one success and one replay rejection.

### Workstream D: Adapter auth propagation

Packages:

- `packages/express`
- `packages/tanstack`
- `packages/http`
- Next scaffolding

Tasks:

- Express:
  - Replace `runtime.handlers.invoke/stream` usage for entrypoints with direct calls to `invoke()` / `stream()` from `@lucid-agents/http`.
  - Pass `req.siwxAuth` via `options.auth`.
- TanStack:
  - Update handler adapter contract so route handlers can receive `auth`.
  - Ensure middleware context auth is passed into invoke/stream execution.
- Next:
  - Ensure route handlers accept auth from middleware and call invoke/stream with `options.auth`.

Exit criteria:

- A handler can assert `ctx.auth.address` after SIWX success in each adapter.
- Invoke and stream both receive auth.

### Workstream E: Fail-closed auth-only routing

Packages:

- `packages/express`
- `packages/hono`
- `packages/tanstack`
- Next scaffolding

Tasks:

- Make auth-only route registration validate runtime SIWX prerequisites.
- Throw early when auth-only is declared without a working SIWX runtime.
- Cover route registration and request behavior separately.

Exit criteria:

- Misconfigured auth-only routes fail during app/runtime setup, not at request time and not by falling open.

### Workstream F: Challenge contract parity

Packages:

- `packages/payments`
- `packages/hono`
- `packages/express`
- `packages/tanstack`
- Next scaffolding

Tasks:

- Add a shared helper for SIWX challenge enrichment.
- Convert Hono to use the shared response shape.
- Normalize all adapters to include the same parseable fields.
- Add client-helper tests against each adapter challenge shape.

Exit criteria:

- `wrapFetchWithSIWx()` recognizes challenge responses from every adapter.

## TDD Plan

The sequence below is mandatory. Do not start implementation in a workstream until its failing tests exist.

### Phase 1: Type and API tests

Add or update tests to fail on the current branch:

- `packages/payments/src/__tests__/siwx-runtime.test.ts`
  - `PaymentsRuntime.siwxStorage is strongly typed`
  - `payments runtime uses shared SIWxStorage type`
- `packages/types` tests if present, otherwise type-level compile checks through existing package tests
  - `SIWxStorage has one canonical definition`

Implementation follows only after the type expectations are captured.

### Phase 2: Canonical signing tests

Add failing tests in `packages/payments/src/__tests__/siwx-client.test.ts` and `packages/payments/src/__tests__/siwx-verify.test.ts`:

- `wrapFetchWithSIWx signs the canonical SIWX message`
- `client-generated SIWX payload verifies successfully with signature verification enabled`
- `verification rejects a signature over JSON payload instead of canonical message`

Implementation:

- Update the client signer path.
- Reuse the canonical builder in both client and server.

### Phase 3: Atomic nonce tests

Add failing tests in `packages/payments/src/__tests__/siwx-storage.test.ts` and `packages/payments/src/__tests__/siwx-verify.test.ts`:

- `consumeNonce returns already_used on second call`
- `sqlite backend does not overwrite an existing nonce`
- `postgres backend does not overwrite an existing nonce`
- `verifySIWxPayload rejects a concurrent replay`

Implementation:

- Change the storage interface.
- Update backends and verification flow.

### Phase 4: Fail-closed auth-only tests

Add failing tests:

- `packages/express/src/__tests__/siwx.test.ts`
  - `createAgentApp throws when authOnly route is mounted without enabled SIWX runtime`
- `packages/hono/src/__tests__/siwx.test.ts`
  - `createAgentApp throws when authOnly route is mounted without enabled SIWX runtime`
- `packages/tanstack/src/__tests__/siwx.test.ts`
  - `createTanStackPaywall rejects authOnly route without SIWX runtime`

Implementation:

- Enforce route-registration validation.

### Phase 5: Handler auth propagation tests

Add failing end-to-end tests that assert `ctx.auth`, not just middleware state:

- `packages/express/src/__tests__/siwx.test.ts`
  - `invoke handler receives auth context on entitlement reuse`
  - `stream handler receives auth context on authOnly route`
- `packages/tanstack/src/__tests__/siwx.test.ts`
  - `invoke handler receives auth context from middleware`
  - `stream handler receives auth context from middleware`

Implementation:

- Refactor adapters to call `invoke()` / `stream()` directly with `options.auth`.

### Phase 6: Challenge parity tests

Add failing tests:

- `packages/hono/src/__tests__/siwx.test.ts`
  - `402 response exposes X-SIWX-EXTENSION`
  - `402 response exposes extensions.siwx`
- `packages/payments/src/__tests__/siwx-client.test.ts`
  - `parseSIWxExtension parses Hono challenge`
  - `wrapFetchWithSIWx retries against Hono-style 402`

Implementation:

- Add shared response enrichment helper.
- Normalize Hono and verify the other adapters still pass.

### Phase 7: Regression and parity sweep

After all targeted fixes land, add or run parity tests that cover:

- paid-route SIWX reuse
- auth-only wallet access
- invalid signature rejection
- mismatched domain rejection
- mismatched URI rejection
- expired payload rejection
- replay rejection
- handler auth visibility
- consistent 401 and 402 challenge shape

## Detailed Test Matrix

### Payments

- `siwx-client.test.ts`
  - canonical signing
  - challenge parsing from header
  - challenge parsing from `extensions.siwx`
  - no retry when no challenge exists
- `siwx-verify.test.ts`
  - valid canonical signature
  - invalid signature
  - domain mismatch
  - URI mismatch
  - expired token
  - not-before violation
  - nonce replay
- `siwx-storage.test.ts`
  - atomic nonce consumption for all backends
  - entitlement recording and lookup
  - duplicate entitlement writes remain idempotent

### Hono

- paid route emits standard parseable challenge
- auth-only route rejects missing SIWX
- handler sees `ctx.auth`
- entitlement reuse bypasses payment

### Express

- auth-only route fails closed during app creation when SIWX is unavailable
- handler sees `ctx.auth` for invoke
- handler sees `ctx.auth` for stream
- entitlement reuse bypasses payment and does not drop auth

### TanStack

- auth-only route fails closed during paywall/runtime setup
- middleware-authenticated invoke reaches handler with auth
- middleware-authenticated stream reaches handler with auth
- challenge response is parseable by client helper

### Next

- scaffolded middleware emits standard challenge
- scaffolded route handlers receive auth from middleware
- client helper succeeds against scaffolded endpoints

## Delivery Order

1. Type cleanup and public runtime typing.
2. Canonical signing fix.
3. Atomic nonce API and storage changes.
4. Fail-closed auth-only validation.
5. Express auth propagation.
6. TanStack auth propagation.
7. Shared challenge helper and Hono normalization.
8. Next parity work.
9. Final regression sweep and docs.

This order minimizes churn. The adapter fixes should happen only after the core signing, nonce, and type contracts are stable.

## Migration Notes

- The nonce storage API change is breaking for any internal callers. Update all SIWX codepaths in one changeset.
- Persistent SIWX nonce tables should keep the same schema where possible, but write semantics must change from overwrite to reject.
- If Next parity cannot be completed in the same window, remove any release claim that Next already supports SIWX and explicitly gate it behind a follow-up milestone.

## Documentation Requirements

Before merge, update:

- SIWX examples to show `ctx.auth`
- adapter docs to describe challenge format and auth propagation
- payments docs to describe storage semantics and replay guarantees
- release notes to call out the nonce API change

## Release Criteria

Do not merge until all of the following are true:

- Every requirement in PR-1 through PR-6 has a corresponding passing test.
- No adapter-specific SIWX casts remain.
- `authOnly` misconfiguration fails during setup.
- The same client helper works against Hono, Express, and TanStack.
- Signature verification passes without `skipSignatureVerification`.
- Replay tests demonstrate only one successful nonce consumption.

## Open Questions

- Should Next parity be completed in this branch, or should SIWX support claims for Next be deferred?
- Do we want one shared adapter-agnostic helper for `401` auth challenge responses, or only for `402` payment challenges?
- Should entitlement keys remain the full absolute URL, or do we want explicit canonicalization before public release?

## Proposed Outcome

After this work, SIWX is no longer an experimental cross-cutting patch. It becomes a coherent payments-owned feature with:

- one canonical message format
- one type definition per concept
- atomic replay protection
- fail-closed auth-only behavior
- direct handler auth propagation
- adapter-consistent challenge responses

That is the minimum bar for shipping SIWX in the Lucid Agents SDK.
