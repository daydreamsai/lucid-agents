---
"@lucid-agents/payments": patch
---

Fix silent failure when using invalid price format

Added runtime validation to detect and warn about invalid price formats:
- `{ amount: 20000 }` - now logs warning and returns null (endpoint becomes free with clear warning)
- `20000` (number) - now logs warning suggesting string format

Valid formats remain:
- String: `price: "20000"` (flat price)
- Object: `price: { invoke: "20000", stream: "10000" }` (separate prices)

This helps developers catch configuration errors that TypeScript's excess property checking may not catch.
