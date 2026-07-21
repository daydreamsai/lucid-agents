# Deployment package guide

This package owns the provider-facing deployment executable. Runtime adapters
remain responsible only for binding the canonical HTTP handlers.

- Keep `src/cli.ts` private; v1 has no JavaScript API.
- Define manifest validation in `src/manifest.ts`; generate the published JSON
  Schema with `bun run generate:schema` instead of editing it by hand.
- Treat provider processes and deployed HTTP origins as system boundaries.
- Read only variables explicitly named by `lucid.deploy.json`.
- Reject Worker variables and unsafe value bindings configured outside the
  deployment manifest.
- Send secret values through provider secret files, never command arguments.
- Redact provider tokens and uploaded secrets from every failure path.
- Preview must use `wrangler versions upload`, never a production deployment.
- Generated Worker entries must remain separate from local Bun server entries.

`src/cli.ts` owns command orchestration. Keep manifest parsing, environment
selection, provider execution, redaction, and HTTP verification in their named
modules so each system boundary remains independently testable.

Test with fake provider executables. No test may require or mutate a live cloud
account.
