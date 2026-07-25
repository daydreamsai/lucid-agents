# @lucid-agents/mpp

## 3.0.0

### Major Changes

- 4757f1b: Require durable task stores for paid work, pre-reserve credential-bearing MPP
  tasks before verification can settle, and use a renewable prepared execution
  claim so x402/MPP settlement cannot race handler execution. Task stores now
  declare durability and implement admission reaping plus prepared-claim renewal
  and activation. Paid-task responses may return any durable terminal
  `TaskStatus` after committed settlement instead of always reporting `running`.
  Paid task requests must supply their recovery capability before authorization;
  the A2A client does this automatically, sends a payment idempotency key, exposes
  settlement metadata, and throws a typed recovery error containing both keys and
  any returned task capability when creation does not complete normally.
  MPP runtimes now expose the canonical decode-only `hasCredential(request)`
  check used for pre-reservation, and custom verifiers must return a non-empty
  `receipt` whenever `valid: true`. Receipts must be exact legal HTTP header
  values no larger than 8 KiB; an unusable receipt after reported success
  consumes the credential so a potentially settled payment is not repeated.

### Minor Changes

- d169013: Add explicit native Tempo session descriptors, durable atomic SQLite and
  Postgres channel stores, invoke billing, and transport-neutral stream
  metering with backpressure-aware receipt and voucher-needed events. Reserve the
  verified session ceiling in shared payment policies, then finalize exactly once
  with delivered atomic usage on completion, failure, or cancellation. Keep
  generated TanStack payment runtimes behind a compiled server-function boundary.
- d169013: Add a runner-agnostic custom credential verifier conformance suite covering provider trust boundaries, replay fencing, idempotent recovery, failure containment, and receipt safety.
- d169013: Add one typed native EVM charge descriptor that accepts Payment Authentication
  and compatible x402 exact credentials through the same settlement strategy,
  with pre-settlement replay fencing, verified payer/network/offer metadata,
  receipt headers, request binding, and OpenAPI discovery.

### Patch Changes

- d169013: Allow Tempo charge methods to use an explicit viem client resolver, handle
  bodyless Tempo session management requests before application input parsing,
  and pin the end-to-end-tested mppx and viem compatibility cohort.
- Updated dependencies [4757f1b]
- Updated dependencies [d169013]
- Updated dependencies [d169013]
- Updated dependencies [d169013]
- Updated dependencies [d169013]
  - @lucid-agents/types@3.0.0

## 2.0.0

### Major Changes

- 44fca3c: Upgrade to security-fixed mppx 0.4.11 and adapt native Tempo and Stripe charge
  materialization to the new method and intent shape. Require the compatible Viem
  peer range used by mppx 0.4. Native Tempo sessions are no longer materialized
  without the signing account that the current Lucid server config cannot supply;
  use a custom method and verifier for session intents.

### Patch Changes

- Updated dependencies [5f35b68]
  - @lucid-agents/types@2.1.0

## 1.0.0

### Major Changes

- 583dc87: Add durable, capability-protected A2A tasks with leases and fenced transitions;
  propagate invocation idempotency through A2A and scheduler clients; and make MPP
  use the standard Payment-Auth wire contract with native mppx Tempo/Stripe
  verification, target-bound challenges, replay fencing, and same-key recovery
  after irreversible settlement. A2A clients now treat cancelled tasks as
  terminal while waiting, and recurring scheduler jobs derive a distinct remote
  idempotency key for each interval occurrence.

  Analytics is now a complete runtime bound to payment storage. Catalog file I/O
  moves to `@lucid-agents/catalog/node`, while the portable root retains parsing
  and generation. Catalog items can select `x402` or `mpp`, with item-level rail
  selection overriding the extension default. Protocol manifests now compose
  through the shared immutable manifest contract, and wallet connectors avoid
  eager server-only globals.

### Patch Changes

- 17fa5eb: Rebuild the SDK documentation around end-to-end x402 seller and buyer journeys,
  with expanded protocol and package references, deployment and operations guides,
  stable runnable examples, and automated checks for drift, snippets, and links.
- Updated dependencies [583dc87]
- Updated dependencies [c21990b]
- Updated dependencies [17fa5eb]
  - @lucid-agents/types@2.0.0

## 0.2.0

### Minor Changes

- Add Machine Payments Protocol support across the SDK with a new `@lucid-agents/mpp` package, typed MPP runtime support, and Hono/Express payment middleware that can issue MPP 402 challenges for priced entrypoints.

### Patch Changes

- Updated dependencies:
  - @lucid-agents/types@1.8.0
