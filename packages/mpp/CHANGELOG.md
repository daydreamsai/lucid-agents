# @lucid-agents/mpp

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
