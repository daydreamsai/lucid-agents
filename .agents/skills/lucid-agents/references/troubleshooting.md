# Troubleshooting

Diagnose from the boundary inward; avoid rewriting the adapter first.

## Module or type errors

Run the project inspector. Reject mixed release channels. Inspect lockfile resolution, package exports, generated declarations, and duplicate copies of `@lucid-agents/types`. Build local workspace dependencies before type-checking consumers. Do not mask version skew with `any`, casts, or re-export shims.

## Missing or duplicate routes

Inspect `runtime.http.routes`, base-path configuration, and adapter binding. Confirm entrypoint keys are unique. Generated framework routes should delegate to `runtime.http.handlers`; remove adapter-local copies only when the user requested a fix.

## Authorization or settlement failures

Record sanitized response status, challenge headers, selected protocol, network, and stable request identifiers. Determine whether failure occurs during challenge creation, credential verification, reservation, handler execution, or settlement. Test that reservations release on handler failure. Never log raw authorization headers, credentials, or secrets.

## State disappears or jobs duplicate

Find the configured store. In-memory defaults reset on restart and cannot coordinate multiple instances. Check atomic reservation or lease operations, idempotency keys, clock assumptions, and retry behavior.

## Runtime portability failures

Locate Node-only imports in packages intended for edge-like runtimes. Keep provider CLI and filesystem behavior outside runtime extensions. Run the repository portability check and test the target adapter's real build.

Report the root cause, evidence, affected versions, and the smallest safe fix separately from optional upgrades.
