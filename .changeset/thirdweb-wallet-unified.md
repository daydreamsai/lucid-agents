---
'@lucid-agents/wallet': minor
'@lucid-agents/examples': patch
---

## Summary

- Added thirdweb Engine wallet connector that integrates with thirdweb Engine server wallets. The connector lazily initializes the Engine account, converts it to a viem wallet client, and exposes it via the shared `WalletConnector` API.
- Introduced shared wallet client abstraction with capability detection. All connectors now expose optional `getCapabilities()`, `getSigner()`, and `getWalletClient()` methods, enabling uniform access to signers and contract-ready wallet clients across connector types.
- Enhanced local EOA connectors to automatically build viem wallet clients from signers. Configure `walletClient` (chain ID, RPC URL, chain name) on local wallet options to enable `getWalletClient()` support.
- Standardized environment variable naming to use `AGENT_WALLET_*` prefix for all wallet types, including thirdweb.
- Reorganized code structure: moved `createPrivateKeySigner` and wallet client creation helpers into `local-eoa-connector.ts` where they belong.
- Added comprehensive unit tests for capability detection, signer access, and wallet client creation.
- Updated documentation with unified wallet client usage patterns and environment variable configuration.

## Breaking Changes

- **Environment variable configuration now requires `AGENT_WALLET_TYPE`**. The `walletsFromEnv()` helper will throw an error if `AGENT_WALLET_TYPE` is not set. Previously, the type could be inferred from available variables.

## Migration Notes

- **Set `AGENT_WALLET_TYPE` explicitly**: Update your environment variables to include `AGENT_WALLET_TYPE=local`, `AGENT_WALLET_TYPE=thirdweb`, or `AGENT_WALLET_TYPE=lucid`.
- **Use unified wallet client API**: All connectors now support `getWalletClient()` when configured. Check capabilities before calling:
  ```ts
  const capabilities = connector.getCapabilities?.();
  if (capabilities?.walletClient) {
    const walletHandle = await connector.getWalletClient();
    const walletClient = walletHandle?.client;
  }
  ```

### Usage Example

```ts
const agent = await createAgent(meta)
  .use(http())
  .use(
    wallets({
      config: {
        agent: {
          type: 'thirdweb',
          secretKey: process.env.AGENT_WALLET_SECRET_KEY!,
          clientId: process.env.AGENT_WALLET_CLIENT_ID,
          walletLabel: 'agent-wallet',
          chainId: 84532,
        },
      },
    })
  )
  .build();

const connector = agent.wallets?.agent?.connector;
const capabilities = connector?.getCapabilities?.();
if (capabilities?.walletClient && connector?.getWalletClient) {
  const walletHandle = await connector.getWalletClient();
  const walletClient = walletHandle?.client;

  await walletClient.writeContract({
    account: walletClient.account,
    chain: walletClient.chain,
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'transfer',
    args: ['0xEA4b0D5ebF46C22e4c7E6b6164706447e67B9B1D', 10_000n],
  });
}
```
