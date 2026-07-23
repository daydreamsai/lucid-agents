---
"@lucid-agents/cli": patch
---

Make project generation transactional, reject invalid wizard input before
writing output, protect generated environment files, keep their secrets out of
dependency installation, mask sensitive prompts, and fail cleanly when
dependency installation does not complete. Failed scaffolds now include a
secret-free rerun command after cleaning their staging output. Make the
identity template boot read-only on Base Sepolia with payment receiving
disabled until a complete destination is supplied, bind registration signers
to the selected identity RPC and chain, reject unsupported registry networks,
and require explicit signer and Ethereum-mainnet registration opt-ins.
