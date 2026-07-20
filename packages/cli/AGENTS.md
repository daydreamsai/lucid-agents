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

## Testing

When changing generated UI:

```bash
bun test packages/cli/tests/cli.test.ts
bun test packages/cli/tests/service-ui-state.test.ts
bun test packages/cli/tests/service-ui-client.test.ts
bun run scripts/test-generated-project.ts next tanstack-ui
```

The generated-project script packs current workspace packages before install.
Do not replace this with a test that resolves `latest` from npm.

Avoid tests tied to component internals. Assert the generated public contract,
user-visible states, accessible markup, and real generated application builds.
