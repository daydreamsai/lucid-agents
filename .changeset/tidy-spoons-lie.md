---
'@lucid-agents/hono': patch
'@lucid-agents/express': patch
---

Fix x402 scheme registration in adapter paywall middleware by registering `ExactEvmScheme` for `eip155:*` instead of passing an empty schemes array.

This resolves payment failures such as `No scheme implementation registered for "exact"` on EVM networks (for example Base Sepolia).
