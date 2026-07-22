# Deployment and production readiness

`@lucid-agents/deploy` is provider-owned tooling, not a runtime extension. Its commands consume a versioned allowlist manifest, protect environment handling, redact secrets, and verify the deployed origin. Inspect the installed command help and manifest schema; provider support changes independently from runtime packages.

Do not present a preview path as production support. Check the adapter/provider combination explicitly.

Before deployment:

1. Build and test with the production runtime target.
2. Confirm required environment variables without printing their values.
3. Use durable stores for payments, tasks, schedules, and other restart-sensitive state.
4. Confirm base URL, proxy headers, TLS, health, discovery, and streaming behavior.
5. Verify payment network, receiver, facilitator or MPP method, and replay protection.
6. Decide whether identity registration is allowed during deployment.
7. Deploy through the provider command's guarded path.
8. Verify the deployed origin, health, Agent Card, and one non-destructive entrypoint.

Never commit `.env`, private keys, provider tokens, or unredacted deployment output. Require explicit authorization for external registration, funded transactions, DNS changes, and production deployment.
