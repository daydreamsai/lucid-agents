# @lucid-agents/api-sdk

## 4.0.0

### Major Changes

- 583dc87: Replace the coupled app runtime with a protocol-neutral extension kernel and a
  single shared HTTP authorization/route layer. Payments now own verification,
  policy admission, settlement, SIWX, and storage lifecycle; adapters bind the
  canonical HTTP route plan instead of implementing their own paywalls.

  Breaking migrations include importing server-only payment storage and Stripe
  support from their documented subpaths, using the runtime HTTP extension for
  adapter payment handling, moving `runtime.handlers` to
  `runtime.http.handlers`/`runtime.http.routes`, and consuming shared capability
  contracts from `@lucid-agents/types`. The API SDK now publishes built ESM
  entrypoints, and the CLI generates projects against the unified runtime surface.
  Outgoing policies now evaluate canonical x402 v2 requirements, and generated
  dashboards construct registered x402 clients before attempting payment.
  Incoming and outgoing accounting is durably staged before irreversible
  settlement so a later recording failure remains fail-closed beyond reservation
  expiry.

### Patch Changes

- 17fa5eb: Rebuild the SDK documentation around end-to-end x402 seller and buyer journeys,
  with expanded protocol and package references, deployment and operations guides,
  stable runnable examples, and automated checks for drift, snippets, and links.

## 3.0.0

### Patch Changes

- Version bump only to stay aligned with the fixed core release group.

## 2.5.0

## 2.4.3

## 2.4.2

## 2.4.1

## 2.4.0

## 2.3.0

## 2.2.3

## 2.2.2

## 2.2.1

## 2.2.0

## 2.1.3

## 2.1.2

## 2.1.1

## 2.1.0

## 0.1.0

### Added

- Initial release
- Auto-generated TypeScript SDK from OpenAPI specification
- React Query integration
- Type-safe client for all API endpoints
- Support for authentication methods (session, token, x402 payments)
