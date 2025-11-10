---
"@lucid-agents/agent-kit": patch
"@lucid-agents/agent-kit-hono": patch
"@lucid-agents/agent-kit-tanstack": patch
"@lucid-agents/create-agent-kit": patch
---

Add comprehensive Solana payment network support

- Add network selection dropdown to all CLI templates with Solana options (solana, solana-devnet)
- Add --network CLI flag for non-interactive mode
- Update validatePaymentsConfig to validate networks against x402 supported list
- Add Solana payment configuration examples and documentation
- Document correct Solana network names: 'solana' (mainnet), 'solana-devnet'
- Document SPL USDC token addresses for mainnet and devnet
- Add network validation tests for both Hono and TanStack adapters
- Clarify that payment network is independent of identity registration (ERC-8004)
- Document that payment addresses can be shared across multiple agents
- Fix CI workflow to run on master branch

Closes #11

