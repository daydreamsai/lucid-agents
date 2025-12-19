---
"@lucid-agents/identity": patch
"@lucid-agents/wallet": patch
"@lucid-agents/types": patch
---

Remove `clientFactory` parameter from `createAgentIdentity` and add support for signer-based developer wallets. Replace LocalEoaSigner with ViemWalletConnector for browser wallet support. SignerWalletOptions now accepts a viem WalletClient directly instead of LocalEoaSigner, enabling browser wallets (e.g., thirdweb) that use eth_sendTransaction instead of eth_signTransaction. Add ViemWalletConnector class that wraps a viem WalletClient directly for both developer and agent wallets. Update createDeveloperWallet and buildSignerWallet to use ViemWalletConnector for signer wallets. Update makeViemClientsFromWallet to prioritize getWalletClient() method. This simplifies the API by allowing direct wallet client passing via `runtime.wallets.developer` instead of requiring a client factory function.
