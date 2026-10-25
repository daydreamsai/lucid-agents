---
"@lucid-agents/payments": patch
---

Reconcile outgoing upto policy accounting with the actual settled amount, including zero, before committing payment history. Preserve payment-count reservations and retain staged capacity when receipt reconciliation or accounting fails after settlement.
