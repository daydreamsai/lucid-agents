---
"@lucid-agents/keeperhub": minor
---

Add `@lucid-agents/keeperhub`: an extension that makes KeeperHub the execution layer behind
entrypoints. `keeperhub({ apiKey, policy })` adds `runtime.keeperhub` and a capability descriptor
to the agent card; `keeperhubTransferEntrypoint`, `keeperhubScheduleEntrypoint`,
`keeperhubDryRunEntrypoint`, `keeperhubStatusEntrypoint` and `keeperhubWatchEntrypoint` sell
one-off payouts, standing orders (agent-authored KeeperHub workflows), dry runs, the execution log,
and an SSE stage stream. Handlers throw on anything short of a verified receipt, so a priced
entrypoint settles only when the transaction has landed. Idempotency keys follow KeeperHub's
documented canonical form and are derived from the caller's reference.
