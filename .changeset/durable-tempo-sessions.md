---
'@lucid-agents/mpp': minor
'@lucid-agents/http': minor
'@lucid-agents/payments': minor
'@lucid-agents/types': minor
'@lucid-agents/cli': patch
---

Add explicit native Tempo session descriptors, durable atomic SQLite and
Postgres channel stores, invoke billing, and transport-neutral stream
metering with backpressure-aware receipt and voucher-needed events. Reserve the
verified session ceiling in shared payment policies, then finalize exactly once
with delivered atomic usage on completion, failure, or cancellation. Keep
generated TanStack payment runtimes behind a compiled server-function boundary.
