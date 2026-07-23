---
"@lucid-agents/cli": patch
---

Make project generation transactional, reject invalid wizard input before
writing output, protect generated environment files, keep their secrets out of
dependency installation, mask sensitive prompts, and fail cleanly when
dependency installation does not complete. Make the identity template boot
read-only on Base Sepolia, bind registration signers to the selected identity
RPC and chain, reject unsupported registry networks, and require explicit
signer and Ethereum-mainnet registration opt-ins.
