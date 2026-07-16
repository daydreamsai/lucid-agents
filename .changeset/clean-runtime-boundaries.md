---
'@lucid-agents/types': major
'@lucid-agents/core': major
'@lucid-agents/identity': major
'@lucid-agents/payments': major
'@lucid-agents/cli': major
'@lucid-agents/api-sdk': major
'@lucid-agents/hono': major
'@lucid-agents/express': major
'@lucid-agents/tanstack': major
'@lucid-agents/http': minor
---

Replace the coupled app runtime with a protocol-neutral extension kernel and a
single shared HTTP authorization/route layer. Payments now own verification,
policy admission, settlement, SIWX, and storage lifecycle; adapters bind the
canonical HTTP route plan instead of implementing their own paywalls.

Breaking migrations include importing server-only payment storage and Stripe
support from their documented subpaths, using the runtime HTTP extension for
adapter payment handling, and consuming shared capability contracts from
`@lucid-agents/types`. The API SDK now publishes built ESM entrypoints, and the
CLI generates projects against the unified runtime surface.
