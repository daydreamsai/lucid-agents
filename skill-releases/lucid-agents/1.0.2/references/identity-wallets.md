# Identity and wallets

Wallet capability is independent from ERC-8004 identity. Build the runtime with the wallet extension first, then initialize identity with that runtime when the installed API requires it.

```ts
const runtime = await createAgent(meta)
  .use(wallets({ config: walletsFromEnv() }))
  .use(http())
  .build();

const identity = await createAgentIdentity({
  runtime,
  domain: 'agent.example.com',
  autoRegister: true,
});
```

Confirm whether optional environment configuration returns `undefined` and handle it deliberately. Never generate or auto-register a production identity merely because credentials exist; registration spends funds and changes external state.

ERC-8004 registration and registries are EVM concepts. Payment receiving may independently use EVM or Solana. Keep chain IDs, addresses, and purposes explicit.

Operational rules:

- Keep private keys and signing connectors server-only.
- Validate address format for the selected chain.
- Use least-privileged funded wallets for registration and settlement.
- Make auto-registration an explicit deployment choice.
- Expose trust configuration through the identity package helper supported by the installed version.
- Treat registry writes as externally visible and test reads before retrying a failed write.
- Never log seeds, private keys, full connector configuration, or signed payloads.
