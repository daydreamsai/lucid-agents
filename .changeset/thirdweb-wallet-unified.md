---
'@lucid-agents/wallet': minor
'@lucid-agents/examples': patch
---

## Summary

- Implemented the first thirdweb Engine wallet connector inside the wallets extension. It lazily builds the Engine account → viem wallet, exposes `getWalletClient()` / `getSigner()`, and wires those into the existing `WalletConnector` façade so payments, identity, and contract calls reuse the Engine-managed key.
- Added a generic signer connector (and runtime wiring) so all connectors share the same `LocalEoaSigner` surface.
- Created `packages/examples/src/wallet/thirdweb-engine-wallets.ts`, a minimal end-to-end script showing how to configure `wallets({ agent: { type: 'thirdweb', ... } })`, sign the facilitator challenge, and send 0.01 USDC through the SDK-managed wallet client.
- Documentation (`docs/WALLETS.md`, `README.md`) now covers the thirdweb setup flow, the new connector methods, and the example usage.

## Breaking Changes

None. This PR adds the thirdweb connector; existing wallets continue to behave the same.

## Migration Notes

- New capability – Configure `wallets({ agent: { type: 'thirdweb', ... } })` to opt into the thirdweb connector and call `const walletClient = await agent.wallets.agent.connector.getWalletClient();` when you need to send transactions.
- Local/Lucid wallets are unchanged.

### Usage Example

```ts
const agent = await createAgent(meta)
  .use(http())
  .use(
    wallets({
      config: {
        agent: {
          type: 'thirdweb',
          secretKey: process.env.THIRDWEB_SECRET_KEY!,
          clientId: process.env.THIRDWEB_CLIENT_ID,
          walletLabel: 'agent-wallet',
          chainId: 84532,
        },
      },
    })
  )
  .build();

const connector = agent.wallets?.agent?.connector as ThirdwebWalletConnector;
const walletClient = await connector.getWalletClient();

await walletClient.writeContract({
  account: walletClient.account,
  chain: walletClient.chain,
  address: USDC_ADDRESS,
  abi: erc20Abi,
  functionName: 'transfer',
  args: ['0xEA4b0D5ebF46C22e4c7E6b6164706447e67B9B1D', 10_000n], // 0.01 USDC
});
```