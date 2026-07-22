# Service UI

UI-capable generated projects own one typed root `service-ui.config.ts`. Use the supported preset—`dossier`, `folio`, or `console`—and bounded semantic color and font tokens.

The HTTP package owns preset validation, shared CSS, and public Agent Card normalization. Hono and Express render the normalized model as static read-only HTML. Next.js and TanStack UI add the shared React interaction controller. TanStack headless sets `servicePage: false` and should not generate UI configuration.

When changing UI:

- Preserve semantic tokens instead of inserting arbitrary framework colors.
- Keep agent metadata and entrypoint definitions in the runtime as the source of truth.
- Do not move secrets, payment credentials, or server handlers into a client bundle.
- Test keyboard navigation, narrow screens, long descriptions, empty states, errors, and streaming.
- Verify that the configured service page and discovery card describe the same runtime.

If a requested design requires unsupported tokens or behavior, extend the owning HTTP model deliberately rather than forking each adapter.
