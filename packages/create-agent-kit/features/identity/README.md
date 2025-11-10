## ERC-8004 Identity Feature

This project was scaffolded with the `identity` feature, which bootstraps an ERC-8004 identity via `@lucid-agents/agent-kit-identity`.

- `AGENT_DOMAIN` controls the domain bound to the identity.
- `RPC_URL` / `CHAIN_ID` configure the registry network.
- Set `IDENTITY_AUTO_REGISTER=false` to skip automatic registration on startup.

`src/agent.ts` also exports `identityClient`, `reputationClient`, and `validationClient` so you can interact with the registries elsewhere in your code.
