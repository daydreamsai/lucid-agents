---
"@lucid-agents/hono": patch
"@lucid-agents/express": patch
---

Fix missing schemes parameter in payment middleware

Fixed a bug where `withPayments()` was not passing the `schemes` parameter to `paymentMiddlewareFromConfig()`. This caused a parameter mismatch with the x402 SDK's expected function signature.

**Changes:**
- `@lucid-agents/hono`: Added empty schemes array `[]` as third parameter to `middlewareFactory()` call
- `@lucid-agents/express`: Added empty schemes array `[]` as third parameter to `middlewareFactory()` call
- Updated tests to verify the schemes parameter is correctly passed

The empty array is correct for the current facilitator-based approach. This fix prepares the codebase for future on-chain verification support where schemes can be populated with scheme servers.
