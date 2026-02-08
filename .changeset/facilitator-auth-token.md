---
'@lucid-agents/types': patch
'@lucid-agents/payments': patch
'@lucid-agents/hono': patch
'@lucid-agents/express': patch
'@lucid-agents/tanstack': patch
'@lucid-agents/cli': patch
---

Add facilitator bearer token support for x402 flows and scaffold it in generated agent env files.

- Add `facilitatorAuth?: string` to `PaymentsConfig`.
- Extend `paymentsFromEnv()` to read facilitator auth from:
  - `FACILITOR_AUTH`
  - `FACILITATOR_AUTH`
  - `PAYMENTS_FACILITATOR_AUTH`
  - fallback: `DREAMS_AUTH_TOKEN`
- Normalize facilitator auth to `Authorization: Bearer ...` and apply it to facilitator `verify`, `settle`, and `supported` requests.
- Wire facilitator auth handling into Hono, Express, TanStack, and Next paywall paths.
- Add `PAYMENTS_FACILITATOR_AUTH` to payment-enabled CLI templates so generated `.env` files include the key by default.
