# Service UI

UI-capable generated projects own one typed root `service-ui.config.ts`. Use the supported preset—`dossier`, `folio`, or `console`—and bounded semantic color and font tokens.

The HTTP package owns preset validation, shared CSS, and public Agent Card normalization. Hono, Express, Next.js, and TanStack UI render the same minimal, read-only endpoint directory. TanStack headless sets `servicePage: false` and should not generate UI configuration.

When changing UI:

- Preserve semantic tokens instead of inserting arbitrary framework colors.
- Keep agent metadata and entrypoint definitions in the runtime as the source of truth.
- Do not move secrets, payment credentials, or server handlers into a client bundle.
- Test narrow screens, long paths and descriptions, empty states, invoke/stream rows, and per-operation prices.
- Verify that the configured service page and discovery card describe the same runtime.

If a requested design requires unsupported tokens or behavior, extend the owning HTTP model deliberately rather than forking each adapter.
