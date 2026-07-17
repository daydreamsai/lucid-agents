---
'@lucid-agents/a2a': major
'@lucid-agents/mpp': major
'@lucid-agents/catalog': major
'@lucid-agents/analytics': major
'@lucid-agents/scheduler': minor
'@lucid-agents/ap2': patch
'@lucid-agents/wallet': patch
---

Add durable, capability-protected A2A tasks with leases and fenced transitions;
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
