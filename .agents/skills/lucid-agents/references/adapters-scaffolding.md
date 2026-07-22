# Adapters and scaffolding

Prefer scaffolding for a new service:

```bash
bunx @lucid-agents/cli my-agent --adapter=hono
bunx @lucid-agents/cli my-agent --adapter=express
bunx @lucid-agents/cli my-agent --adapter=tanstack-ui
bunx @lucid-agents/cli my-agent --adapter=tanstack-headless
```

Use the project's installed CLI version and read the generated `AGENTS.md`. Do not regenerate an existing project over user changes.

## Hono and Express

Both adapters expose `createAgentApp(runtimeOrBuilder)` in current stable lines. The returned object includes the app and an entrypoint registration path. Express must listen on a port; Hono deployment depends on the chosen host.

## TanStack Start

Use `createTanStackRuntime(runtimeOrBuilder)`. Generated routes delegate to its handlers. TanStack UI includes the shared read-only endpoint directory; headless mode disables the service page.

## Next.js

Next.js is a CLI template rather than a separate runtime package. App Router modules must delegate to the canonical HTTP handlers. Keep server-only runtime and secrets out of client components.

## Invariants

- Do not implement paywalls, discovery, health, streaming, or task routes inside an adapter.
- Preserve configured base paths.
- If the runtime route plan changes, test each affected adapter and the cross-package smoke example.
- Generated UI projects own one root `service-ui.config.ts`; avoid framework-specific copies.
