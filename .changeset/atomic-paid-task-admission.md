---
"@lucid-agents/a2a": major
"@lucid-agents/http": major
"@lucid-agents/mpp": major
"@lucid-agents/payments": patch
"@lucid-agents/types": major
---

Require durable task stores for paid work, pre-reserve credential-bearing MPP
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
