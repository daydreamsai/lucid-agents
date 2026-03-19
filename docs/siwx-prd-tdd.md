# PRD/TDD: Sign-In With X (SIWX) Integration

Status: Draft
Owner: SDK (Payments + Types + HTTP + Adapters + CLI)
Last Updated: 2026-03-19

## Summary

Integrate x402 Sign-In With X (SIWX) into the Lucid Agents monorepo so developers can:

1. Let returning wallets access previously paid resources without paying again.
2. Optionally protect auth-only routes with wallet signatures.
3. Use a first-class Lucid API instead of hand-wiring x402 extension declarations and verification hooks.

This document covers both product requirements and the technical delivery plan.

## Background

SIWX is an x402 extension layered on top of `402 Payment Required` flows. A server declares the `sign-in-with-x` extension in protected responses. A client signs a CAIP-122-compatible message and retries with a `SIGN-IN-WITH-X` header. The server verifies the signed payload and grants access when the wallet is authorized for the resource.

In practice, SIWX creates two product capabilities:

1. Paid-resource reuse
   A wallet that already paid for a resource can re-access it without re-paying.
2. Wallet-auth-only access
   A route can require wallet authentication even when no payment is required.

## Problem

The current Lucid payments stack supports x402 payments, route protection, payment tracking, and policy enforcement, but it does not provide SIWX primitives.

The current gaps are:

- The repo is pinned to `@x402/*` `2.2.0`, while the clean SIWX integration path relies on newer x402 server/client hooks.
- Existing payment tracking stores aggregate policy data, not wallet-resource entitlements.
- Entrypoints only model payment-oriented route protection (`price`, `network`) and do not model auth-only SIWX routes.
- Handler context does not expose typed authenticated wallet identity.
- Generated dashboard clients only handle payment-wrapped fetch and need a clean way to compose SIWX.

## Goals

- Add first-class SIWX support to the Lucid payments system.
- Keep SIWX domain logic in `@lucid-agents/payments`.
- Support all maintained adapters:
  - `@lucid-agents/hono`
  - `@lucid-agents/express`
  - `@lucid-agents/tanstack`
  - CLI-generated Next adapter
- Provide a typed developer-facing configuration surface.
- Persist entitlements and replay-protection data using Lucid-owned storage backends.
- Expose authenticated wallet identity to handlers in a typed, documented way.
- Deliver the implementation test-first with a clear TDD sequence.

## Non-Goals

- Building a full end-user account system.
- Building OAuth-like sessions, cookies, or JWT login flows.
- Supporting arbitrary auth extensions beyond SIWX in this initial effort.
- Designing a generic auth framework before we need one.
- Implementing SIWX for non-HTTP transports in the first release.

## Product Scope

### In Scope for Phase 1

- SIWX for paid-route reuse.
- Global SIWX configuration under the payments extension.
- Per-entrypoint SIWX opt-in.
- Persistent entitlement storage keyed by resource and wallet address.
- Nonce tracking to prevent signature replay.
- Typed handler auth context for verified SIWX requests.
- Adapter integration across Hono, Express, TanStack, and Next.
- Dashboard/runtime client composition for payment + SIWX fetch.
- CLI template support where payments are scaffolded.

### In Scope for Phase 2

- Auth-only SIWX routes with no payment requirement.
- Explicit handler ergonomics for wallet-gated business logic.
- Optional smart wallet verification enhancements via `viem` verifier configuration.

### Explicitly Out of Scope for Initial Release

- Solving cross-resource entitlement hierarchies.
- Delegated auth between wallets.
- User profile management.
- Revocation lists beyond nonce replay prevention.

## User Stories

- As an agent developer, I can mark a paid entrypoint as SIWX-enabled so repeat access does not require repeat payment.
- As an agent developer, I can optionally require wallet authentication for an entrypoint even if it is free.
- As an agent developer, I can inspect the authenticated wallet inside my handler without parsing raw headers.
- As an operator, I can choose SQLite, in-memory, or Postgres storage for SIWX state.
- As a template user, I can scaffold an app that is ready for SIWX without hand-editing x402 internals.

## Success Criteria

- A wallet that has paid for a protected resource can access that same resource again by presenting a valid SIWX proof.
- SIWX configuration is consistent across adapters.
- Entitlements survive restarts when persistent storage is configured.
- Replay of a previously used nonce is rejected.
- Developers can read authenticated wallet identity from handler context.
- Tests cover happy path, replay prevention, invalid signatures, adapter behavior, and migration behavior.

## Current State

### Current Strengths

- Payments already own route-level payment configuration and runtime activation.
- Adapters already centralize x402 paywall integration.
- Payments already own persistent storage abstractions for SQLite, Postgres, and in-memory modes.
- Incoming payment recording already happens after successful settlement in Hono and Express.
- TanStack already uses `x402HTTPResourceServer` directly, which is close to the official SIWX hook model.

### Current Limitations

- Current payment tracking is aggregate-only and cannot answer `has wallet X paid for resource Y?`
- Route registration skips unpaid routes, which blocks auth-only SIWX.
- Current handler context only includes raw request headers under metadata.
- Current client helpers are payment-aware but not SIWX-aware.

## Product Decisions

This PRD locks the following decisions:

1. SIWX is owned by the payments domain, not by a new top-level auth package.
2. Entitlement storage is a new storage surface, not a reinterpretation of aggregate payment tracker data.
3. Typed handler auth context is required for release; raw-header-only access is not sufficient.
4. Phase 1 prioritizes paid-route reuse before auth-only routes.
5. The implementation will adopt newer x402 packages rather than recreating the entire SIWX protocol manually.

## Functional Requirements

### FR-1: Global SIWX configuration

The payments extension must accept optional SIWX configuration.

Required capabilities:

- Enable or disable SIWX globally.
- Configure a default SIWX statement.
- Configure entitlement storage.
- Configure verification options for EVM smart wallet support.
- Configure default expiration behavior.

### FR-2: Per-entrypoint SIWX declaration

Entrypoints must be able to opt into SIWX independently.

Required modes:

- `enabled`: allow SIWX for returning paid access.
- `authOnly`: require SIWX even when no payment is required.

Per-entrypoint config must support:

- `statement`
- optional override network or supported chains
- optional enable/disable

### FR-3: Protected response declaration

When an SIWX-enabled route returns `402 Payment Required`, the response must declare the `sign-in-with-x` extension with the correct metadata for that resource.

Required fields:

- resource URI
- domain
- nonce
- version
- issuance timestamp
- optional expiration
- supported chains
- schema

### FR-4: Entitlement recording after settlement

After a successful payment settlement on an SIWX-enabled route, the server must record that the payer wallet is entitled to the resource.

Required behavior:

- Only record entitlement on successful settlement.
- Record entitlement by canonical resource key and normalized wallet address.
- Preserve adapter consistency for the same route shape.

### FR-5: Pre-payment SIWX access grant

For SIWX-enabled routes, the server must inspect the `SIGN-IN-WITH-X` header before enforcing payment.

Required behavior:

- Validate payload shape.
- Validate domain and resource URI.
- Validate issued-at, expiration, and not-before semantics.
- Verify signature for supported chains.
- Reject replayed nonces when nonce tracking is enabled.
- Grant access without payment when the wallet has entitlement for that resource.

### FR-6: Auth-only SIWX routes

Routes must be able to require SIWX without requiring payment.

Required behavior:

- A route can be protected even when `price` is absent.
- A request without valid SIWX auth receives an auth-related error response.
- A request with valid SIWX auth reaches the handler.

### FR-7: Typed auth context in handlers

Handlers must receive typed auth information for successful SIWX requests.

Required fields:

- auth scheme
- wallet address
- chain identifier
- original SIWX payload
- whether access was granted due to prior entitlement

### FR-8: Storage backend support

SIWX state must support:

- SQLite
- in-memory
- Postgres

The storage contract must support:

- entitlement lookup
- entitlement record write
- nonce existence lookup
- nonce record write
- clear/reset for tests

### FR-9: Adapter parity

All maintained adapters must behave consistently for:

- 402 responses with SIWX extension declaration
- SIWX retry requests
- payment settlement and entitlement recording
- auth-only SIWX enforcement

### FR-10: Client ergonomics

Lucid-owned client helpers must be able to compose payment handling and SIWX handling.

Required outcomes:

- Dashboard-generated clients can reuse access via SIWX.
- Runtime payment fetch helpers can optionally produce SIWX-aware fetch functions.
- Developers do not need to hand-wire request/response hooks.

## API and Type Design

## Proposed Public API

### Payments extension

```ts
payments({
  config: paymentsFromEnv(),
  siwx: {
    enabled: true,
    defaultStatement: 'Sign in to reuse your paid access.',
    expirationSeconds: 300,
    storage: {
      type: 'sqlite',
    },
    verify: {
      evmRpcUrl: process.env.SIWX_EVM_RPC_URL,
    },
  },
});
```

### Entrypoint definition

```ts
addEntrypoint({
  key: 'report',
  description: 'Paid report access with SIWX reuse',
  price: '0.01',
  siwx: {
    enabled: true,
    statement: 'Sign in to reuse your paid report access.',
  },
  handler: async ctx => {
    return { output: { ok: true } };
  },
});
```

### Auth-only route

```ts
addEntrypoint({
  key: 'profile',
  description: 'Wallet-authenticated profile lookup',
  siwx: {
    authOnly: true,
    network: 'eip155:8453',
    statement: 'Sign in to view your profile.',
  },
  handler: async ctx => {
    return {
      output: {
        wallet: ctx.auth?.address,
      },
    };
  },
});
```

### Handler context

```ts
type AgentAuthContext =
  | {
      scheme: 'siwx';
      address: string;
      chainId: string;
      grantedBy: 'entitlement' | 'auth-only';
      payload: Record<string, unknown>;
    }
  | undefined;
```

## Type Requirements

- `EntrypointDef` must support a typed `siwx` field.
- `AgentContext` must support a typed `auth` field.
- `PaymentsConfig` must support an optional `siwx` block.
- `PaymentsRuntime` must expose SIWX runtime state directly if needed by adapters.
- Avoid duplicate "internal" and "public" SIWX runtime types.

## Data Model

## SIWX Entitlement Record

Proposed record:

```ts
type SIWxEntitlementRecord = {
  id?: number;
  resource: string;
  address: string;
  chainId?: string | null;
  paymentNetwork?: string | null;
  paidAt: number;
  lastUsedAt?: number | null;
};
```

## SIWX Nonce Record

```ts
type SIWxNonceRecord = {
  id?: number;
  nonce: string;
  resource?: string | null;
  address?: string | null;
  usedAt: number;
  expiresAt?: number | null;
};
```

## Storage Interface

```ts
interface SIWxStorage {
  hasPaid(resource: string, address: string): Promise<boolean>;
  recordPayment(resource: string, address: string, chainId?: string): Promise<void>;
  hasUsedNonce(nonce: string): Promise<boolean>;
  recordNonce(nonce: string, metadata?: { resource?: string; address?: string; expiresAt?: number }): Promise<void>;
  clear(): Promise<void>;
}
```

## Canonical Resource Key

The server must canonicalize a resource key consistently across adapters.

Initial rule:

- Use the full absolute request URL for entitlement matching.

Follow-up optimization is allowed later if we want configurable normalization, but the first release must use one deterministic rule everywhere.

## Architecture

### Ownership

- `@lucid-agents/payments`
  - SIWX config types
  - storage interfaces and implementations
  - runtime construction
  - route declaration helpers
  - signature verification helpers and verifier wiring
- `@lucid-agents/types`
  - public SIWX and auth types
- `@lucid-agents/http`
  - passes typed auth context into handlers
- adapters
  - call payments-owned SIWX helpers
  - do not own protocol logic
- `@lucid-agents/cli`
  - template and env support

### x402 dependency strategy

The implementation should bump the x402 stack to a version that supports the official SIWX hooks and transport-level server APIs.

Required packages:

- `@x402/core`
- `@x402/fetch`
- `@x402/hono`
- `@x402/express`
- `@x402/next`
- `@x402/extensions`

### Adapter strategy

#### TanStack

TanStack is the easiest first integration because it already constructs `x402ResourceServer` and `x402HTTPResourceServer` directly. We should register SIWX extension and request/settlement hooks there first.

#### Hono and Express

Hono and Express currently use config-based middleware helpers. They should be moved to a payments-owned builder that constructs a configured resource server and HTTP server directly, then hands that server to the adapter wrapper.

#### Next

The generated Next adapter should follow the same model and use the direct HTTP-server wrapping path, not a config-only shortcut.

## Implementation Plan

### Phase 0: Dependency and API preparation

- Bump x402 packages.
- Add `@x402/extensions`.
- Add public SIWX types in `@lucid-agents/types`.
- Add handler auth typing.

### Phase 1: Paid-route SIWX reuse

- Add `payments.siwx` config.
- Add `entrypoint.siwx.enabled`.
- Add entitlement storage.
- Add 402 extension declarations.
- Add settlement-time entitlement recording.
- Add request-time SIWX verification and entitlement check.
- Add client helper composition.

### Phase 2: Auth-only routes

- Allow protected routes without `price`.
- Add auth-only route response behavior.
- Add end-to-end tests for free but authenticated entrypoints.

### Phase 3: CLI and docs

- Add SIWX prompts or documented env keys to relevant templates.
- Update payments docs and examples.
- Add at least one example app using paid-route SIWX.

## TDD Strategy

The implementation must be test-first. Each layer below should be built in order.

### Step 1: Types and storage tests

Write failing tests for:

- SIWX storage interface contract.
- SQLite storage `hasPaid` and `recordPayment`.
- Postgres storage `hasPaid` and `recordPayment`.
- In-memory storage behavior.
- Nonce persistence and replay detection.

Then implement storage.

### Step 2: Runtime configuration tests

Write failing tests for:

- payments runtime builds with SIWX disabled.
- payments runtime builds with SIWX enabled.
- invalid SIWX config throws at startup.
- entrypoint SIWX opt-in merges correctly with global defaults.

Then implement runtime config and validation.

### Step 3: Route declaration tests

Write failing tests for:

- SIWX-enabled paid route emits x402 extension declaration.
- auth-only SIWX route is registered even without `price`.
- non-SIWX route does not emit SIWX extension declaration.

Then implement route-building changes.

### Step 4: Verification flow tests

Write failing tests for:

- valid SIWX header on entitled wallet grants access before payment.
- valid SIWX header on non-entitled wallet does not bypass payment.
- invalid signature is rejected.
- mismatched resource URI is rejected.
- expired SIWX payload is rejected.
- replayed nonce is rejected.

Then implement verification flow.

### Step 5: Settlement and entitlement tests

Write failing tests for:

- successful paid request records entitlement.
- failed settlement does not record entitlement.
- only successful 2xx protected responses record entitlement.
- canonical resource key is consistent for recording and lookup.

Then implement settlement hooks.

### Step 6: Handler context tests

Write failing tests for:

- handler receives `ctx.auth` on successful SIWX grant.
- handler does not receive `ctx.auth` on non-SIWX request.
- auth-only route handler receives the authenticated wallet.

Then implement context plumbing.

### Step 7: Adapter tests

Write failing tests for each adapter:

- unpaid paid-route returns 402 with SIWX extension declaration.
- paid route records entitlement.
- returning wallet with SIWX header bypasses payment.
- auth-only route rejects missing SIWX.
- auth-only route accepts valid SIWX.

Then implement adapter wiring.

### Step 8: Client tests

Write failing tests for:

- dashboard fetch helper retries with SIWX on 402 with SIWX extension.
- non-SIWX 402 falls back to normal payment behavior.
- payment + SIWX composition works for invoke and stream.

Then implement client helpers.

### Step 9: CLI and template tests

Write failing tests for:

- template generation includes SIWX config when requested.
- env/config documentation is generated correctly.
- non-interactive template arguments are supported.

Then implement CLI support.

## Detailed Test Matrix

### Unit Tests

#### Payments package

- SIWX config validation
- SIWX storage adapters
- resource canonicalization
- nonce replay behavior
- entitlement lookup behavior
- verifier configuration behavior

#### Types package

- public type compile coverage for:
  - `EntrypointDef.siwx`
  - `AgentContext.auth`
  - `PaymentsConfig.siwx`

#### HTTP package

- `ctx.auth` propagation into handlers
- invoke and stream parity

### Integration Tests

#### Hono

- `402` response contains SIWX extension for enabled route
- repeat access works after prior payment
- invalid SIWX rejected
- auth-only route enforced

#### Express

- same matrix as Hono

#### TanStack

- same matrix as Hono

#### Next adapter

- proxy or route wrapper emits SIWX declaration
- repeat access works after prior payment

### Regression Tests

- Non-SIWX paid routes behave exactly as before.
- Existing payment policies continue to function.
- Solana payment paths remain intact.
- Facilitator auth headers still apply.

## Acceptance Criteria

- SIWX can be enabled globally and per entrypoint.
- SIWX-enabled paid routes emit proper extension declarations.
- Successful payments create wallet-resource entitlements.
- Returning entitled wallets can re-access resources via SIWX without re-payment.
- Replay protection is enforced via nonce tracking.
- Auth-only SIWX routes work without requiring `price`.
- Handlers receive typed auth context.
- Hono, Express, TanStack, and Next adapters behave consistently.
- Generated client helpers support SIWX-aware fetch composition.
- Unit, integration, and CLI tests cover the feature set.

## Rollout and Migration

### Migration Rules

- Existing agents with payments but no SIWX config remain unchanged.
- SIWX is opt-in.
- Existing payment tracker data is not repurposed as entitlement data.
- Storage migrations for SQLite and Postgres must be additive.

### Suggested Rollout

1. Land dependency bump and SIWX storage/runtime types.
2. Land TanStack integration and tests first.
3. Land Hono and Express.
4. Land Next adapter.
5. Land client helper and CLI/template support.
6. Publish docs and example.

## Risks

- x402 version bump may require adjacent compatibility fixes.
- Smart wallet verification may require RPC-backed verifier configuration.
- Resource canonicalization mistakes could create false entitlement misses.
- Auth-only routes may expose edge cases in adapter route registration.

## Open Questions

1. Should auth-only SIWX failures return `401`, `403`, or `402` with a SIWX-only declaration?
2. Should entitlements be scoped by full URL, route path, or configurable canonical resource keys?
3. Should entitlement records expire by default, or remain durable until explicitly cleared?
4. Do we want a first-release CLI prompt for SIWX, or just documented manual config?
5. Should streaming routes reuse the same entitlement as invoke routes, or be tracked independently by full resource URL?

## Recommended Answers to Open Questions

1. Auth-only SIWX should return `401` with a structured JSON auth error in the first release.
2. Use full absolute URL for the first release to avoid hidden normalization behavior.
3. Keep entitlements durable by default; expiration can be added later if needed.
4. Start with documented manual config, then add CLI prompts once the API settles.
5. Track invoke and stream independently because they are distinct resources today.
