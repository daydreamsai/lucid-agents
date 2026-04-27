---
"@lucid-agents/x402station": minor
---

Added `@lucid-agents/x402station` — a pre-flight oracle client for x402 endpoints. Six methods (`preflight`, `forensics`, `catalogDecoys`, `watch.subscribe`, `watch.status`, `watch.unsubscribe`) wrapping the public oracle at https://x402station.io. Four are paid via x402 ($0.001–$0.01 USDC, auto-signed via the agent's `X402Account` through `@lucid-agents/payments`'s `createX402Fetch`); two are free + secret-gated for managing an existing webhook subscription. Networks: Base mainnet and Base Sepolia.
