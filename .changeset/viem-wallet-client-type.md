---
"@lucid-agents/types": patch
"@lucid-agents/wallet": patch
---

Replace custom ViemWalletClient interface with viem's WalletClient type

- Add viem as a peer dependency in @lucid-agents/types
- Replace custom `ViemWalletClient` interface with `import type { WalletClient } from 'viem'`
- Update `SignerWalletOptions` to use viem's official `WalletClient` type
- Update `ViemWalletConnector` in @lucid-agents/wallet to use the imported type
- Improves type compatibility with third-party wallet adapters (e.g., thirdweb)

This change ensures better type safety and compatibility when using browser wallets that return viem `WalletClient` instances.
