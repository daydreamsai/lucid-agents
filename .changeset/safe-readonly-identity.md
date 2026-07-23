---
"@lucid-agents/identity": major
---

Default ERC-8004 identity initialization to read-only, discover existing IDs
through bounded domain-owned registration documents or explicit token IDs,
validate token IDs consistently as uint256 values, allow registry clients
without a wallet, and require an explicit opt-in plus signer for registration.
Runnable identity examples are read-only by default or require a separate
write-example acknowledgement before submitting registry transactions.
