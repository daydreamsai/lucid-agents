# @lucid-agents/deploy

`lucid-deploy` reads a versioned `lucid.deploy.json` from a generated Lucid
project and performs a guarded provider deployment. The first supported path is
a blank Hono service uploaded as an isolated Cloudflare Worker version.

```bash
bunx wrangler login
bun run deploy
```

The preview command uploads only environment names in the manifest allowlist,
uses encrypted Worker secrets for values classified as secrets, forces
`IDENTITY_AUTO_REGISTER=false` and `REGISTER_IDENTITY=false`, rejects
provider-configured Worker variables and unsafe value bindings outside that
boundary, prints a redacted plan, and verifies `/`, `/health`, and
`/.well-known/agent-card.json` at the returned preview URL.

For CI, set `CLOUDFLARE_API_TOKEN` and run `bun run deploy -- --yes`. Production
deployment and preview cleanup are intentionally rejected by this tracer
release. The package exposes an executable and manifest schema, not a public
JavaScript API.
