---
"@lucid-agents/identity": minor
---

Add transfer functions to identity registry client

- `transfer(to, agentId)` - Transfer identity token to another EVM address using safeTransferFrom
- `transferFrom(from, to, agentId)` - Transfer from one address to another (signer must be owner or approved)
- `approve(to, agentId)` - Approve an address to transfer the identity token
- `setApprovalForAll(operator, approved)` - Approve or revoke an operator for all tokens
- `getApproved(agentId)` - Get the approved address for a token (read-only)
