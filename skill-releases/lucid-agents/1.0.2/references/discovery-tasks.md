# Discovery, A2A tasks, scheduler, and catalogs

The HTTP package owns public Agent Card normalization and discovery routes. Add metadata and entrypoints to the runtime; do not hand-build a second card in an adapter.

`@lucid-agents/a2a` owns agent-to-agent cards, client calls, and the task state machine. A task store must enforce ownership and valid state transitions. The in-memory store is appropriate for tests and single-process development, not restart-safe production.

For scheduled calls, `@lucid-agents/scheduler` uses leased, idempotent jobs. Durable implementations must make lease acquisition atomic, tolerate worker death, and use a stable invocation key so retries do not duplicate work.

`@lucid-agents/catalog` registers entrypoints from YAML or CSV. Validate catalogs before registration and preserve the one-entrypoint-registry rule. Catalog data is configuration, not a place to bypass schemas or authorization.

Verification checklist:

- Discovery returns the expected canonical base URL and capabilities.
- A2A clients validate the remote card and response shape.
- Task reads and updates enforce the owning principal.
- Invalid state transitions fail predictably.
- Retry and lease-expiry tests demonstrate idempotency.
- Production deployments use durable task and scheduler stores.
