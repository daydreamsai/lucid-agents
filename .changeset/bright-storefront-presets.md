---
"@lucid-agents/http": major
"@lucid-agents/types": minor
"@lucid-agents/cli": minor
---

Add typed Dossier, Folio, and Console service UI presets with bounded color and
font tokens, full public Agent Card information parity, and one browser-safe
renderer contract shared by static and React adapters.

Generated Hono and Express storefronts are now deliberately read-only and ship
without client JavaScript or browser invocation controls. Next and TanStack UI
retain invoke, stream, task, SIWX, x402, and MPP interactions through the shared
React controller. The CLI writes `service-ui.config.ts`, supports
`--ui-preset`, and disables the storefront explicitly for TanStack headless.
CI generates a deterministic kitchen-sink service for all twelve themed
adapter/preset combinations, deploys the three React themes as versioned
Cloudflare previews, and verifies deployed URLs with Playwright.
