---
"@lucid-agents/payments": minor
---

Add an optional `beforePayment` check to outgoing payment policies
(`createRuntimePaymentContext` and `wrapBaseFetchWithPolicy`) that can block a
payment before it is reserved or signed. Unset by default.
