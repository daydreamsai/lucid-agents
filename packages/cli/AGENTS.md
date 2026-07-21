# Generated Frontend Guide

The CLI owns one shared React service UI under `adapters/ui`. Next copies the
contents of `adapters/ui/src` into its project root. TanStack UI copies the
TanStack headless base first and then overlays `adapters/ui` and its
framework-specific UI shell.

## Boundaries

- Build presentation data with `buildServicePageModel()` from
  `@lucid-agents/http`.
- Load the Agent Card and health through public HTTP handler contracts.
- Do not inspect `runtime.entrypoints`, `runtime.payments`, or
  `runtime.agent.config` from generated pages.
- Keep reusable components, invocation state, schema helpers, SSE parsing, and
  task clients in `adapters/ui`.
- Keep only routing, request adaptation, document metadata, and providers in
  Next or TanStack overlays.
- TanStack headless remains API-only and must not receive the shared UI layer.
- `service-ui.config.ts` is the only generated user-editable visual config.
  Keep preset resolution, token validation, and shared CSS in the browser-safe
  `@lucid-agents/http/service-ui` subpath.
- Hono and Express storefronts are static/read-only. Do not add browser scripts,
  credential fields, or invoke controls to the portable renderer.
- React interaction state belongs in `use-service-storefront.ts`; preset
  components consume the same controller and `ServicePageModel`.

## Testing

When changing generated UI:

```bash
bun test packages/cli/tests/cli.test.ts
bun test packages/cli/tests/service-ui-state.test.ts
bun test packages/cli/tests/service-ui-client.test.ts
bun run scripts/test-generated-project.ts next all
bun run scripts/test-generated-project.ts tanstack-ui console
```

The generated-project script packs current workspace packages before install.
Do not replace this with a test that resolves `latest` from npm.

Avoid tests tied to component internals. Assert the generated public contract,
user-visible states, accessible markup, and real generated application builds.

## Deployment overlays

Deployment assets are adapter/template overlays, not runtime-adapter behavior.
The first overlay applies only to `blank` + `hono` unless `--no-deploy` is
passed. It contributes `src/worker.ts`, `wrangler.jsonc`,
`lucid.deploy.json`, package scripts/dependencies, and an appended README
section while leaving `src/index.ts` unchanged.

Keep provider execution, environment allowlisting, redaction, confirmation,
and public-origin verification in `@lucid-agents/deploy`. Generated adapters
must continue delegating requests to the canonical HTTP runtime and must not
grow provider-specific paywalls or route registries.
