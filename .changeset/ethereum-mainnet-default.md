---
"@lucid-agents/cli": patch
"@lucid-agents/identity": patch
"@lucid-agents/core": patch
"@lucid-agents/payments": patch
"@lucid-agents/tanstack": patch
"@lucid-agents/examples": patch
---

Switch default network from Base Sepolia to Ethereum Mainnet

CHANGES:

- Default payment network changed from `base-sepolia` to `ethereum` across all CLI templates and adapters
- Added Ethereum Mainnet ERC-8004 contract addresses:
  - Identity Registry: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
  - Reputation Registry: `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`
- Updated all template defaults (blank, axllm, axllm-flow, identity, trading-data-agent, trading-recommendation-agent)
- Updated CLI adapter network configurations (hono, express, next)
- Updated example environment files
- Updated documentation and READMEs

MIGRATION:

Existing agents are not affected - they retain their configured network. New agents created via CLI will default to Ethereum Mainnet. To use a testnet, explicitly select `base-sepolia` during agent creation or set `PAYMENTS_NETWORK=base-sepolia` in your `.env` file.
