## Deploy to Cloudflare

This Hono project keeps `src/index.ts` as its local Bun server and uses the
fetch-native `src/worker.ts` only for Cloudflare. The default command uploads an
isolated Worker version with the stable `preview` alias; it does not change the
production deployment.

Authenticate once for interactive use, then deploy:

```bash
bunx wrangler login
bun run deploy
```

The command prints the returned preview URL and verifies these same-origin
routes before reporting success:

```text
/
/health
/.well-known/agent-card.json
```

Only values named in `lucid.deploy.json` can be uploaded. The generated
allowlist covers agent metadata plus configured payment, wallet, Stripe, and
model-provider values. Secret-classified values use encrypted Worker secrets;
all confirmations are redacted. Arbitrary `.env` entries are ignored.

Preview deployment always forces `IDENTITY_AUTO_REGISTER=false` and
`REGISTER_IDENTITY=false`. A configured private signing key or mainnet payment
network requires explicit confirmation. Review those values before continuing;
do not use a production signing key in a preview unless that exposure is
intentional.

For non-interactive CI, provide a scoped Cloudflare token and both required
confirmation inputs:

```bash
export CLOUDFLARE_API_TOKEN='replace-with-a-scoped-token'
bun run deploy -- --yes
```

If authentication fails, run `bunx wrangler whoami`, then `bunx wrangler login`
again or verify the token's Worker permissions. This tracer release rejects
`--prod` and `--destroy-preview`; those operations are not silently mapped to a
preview upload.

To scaffold the same local Hono project without any deployment dependency,
Worker entry, Wrangler configuration, or deployment manifest, generate it with
`--no-deploy`:

```bash
bunx @lucid-agents/cli {{AGENT_NAME}} \
  --adapter=hono \
  --template=blank \
  --no-deploy
```
