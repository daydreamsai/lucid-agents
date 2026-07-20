# @lucid-agents/identity

Draft ERC-8004 identity and reputation clients, trust metadata, registration
files, and OASF discovery for Lucid Agents. A manual validation compatibility
client remains exported, but validation is deprecated while the draft evolves.

ERC-8004 identity is EVM-only. It is independent of the network on which an
agent accepts payments.

The `A2A` service label below records an Agent Card endpoint. Lucid's current
card/task profile is not the official A2A v1 transport and does not imply TCK
conformance.

## Runtime extension

```bash
bun add @lucid-agents/identity @lucid-agents/wallet
```

```ts
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { identity, identityFromEnv } from '@lucid-agents/identity';
import { wallets, walletsFromEnv } from '@lucid-agents/wallet';

const agent = await createAgent({
  name: 'verified-agent',
  version: '1.0.0',
  description: 'An ERC-8004 registered agent',
})
  .use(wallets({ config: walletsFromEnv() }))
  .use(
    identity({
      config: identityFromEnv({
        registration: {
          selectedServices: ['A2A', 'web', 'OASF'],
          website: 'https://agent.example',
          oasf: {
            authors: ['Example Org'],
            skills: ['research'],
            domains: ['finance'],
            modules: [],
            locators: [],
          },
        },
      }),
    })
  )
  .use(http())
  .build();
```

The extension resolves identity once during build. Do not call
`createAgentIdentity()` again for the same generated application. The complete
result is available at:

```ts
const result = agent.identity?.result;
result?.record;
result?.clients?.identity;
result?.clients?.reputation;
result?.clients?.validation; // undefined by default; type retained for compatibility
```

Identity trust is contributed to the live agent card, and the HTTP OASF handler
uses the live canonical entrypoint registry. Dynamic entrypoints therefore
appear in OASF without maintaining a second registry.

## Configuration and failure behavior

`identityFromEnv(overrides)` reads:

- `AGENT_DOMAIN`
- `REGISTER_IDENTITY` or `IDENTITY_AUTO_REGISTER`
- `RPC_URL`
- `CHAIN_ID`
- `IDENTITY_*` service and OASF fields

Registration needs a signing wallet. If the extension must resolve or register
identity and neither a developer nor agent wallet is installed, build fails
closed. For a read-only deployment, provide a precomputed `trust` configuration
instead:

```ts
.use(identity({
  config: {
    trust: {
      registrations: [{
        agentId: '42',
        agentRegistry:
          'eip155:84532:0x0000000000000000000000000000000000000000',
      }],
      trustModels: ['feedback', 'inference-validation'],
    },
  },
}))
```

With static trust, no registration transaction or wallet is required.

## Registration document

An ERC-8004 registration points to an off-chain document, conventionally:

```text
https://agent.example/.well-known/agent-registration.json
```

Generate it from the extension result:

```ts
import { generateAgentRegistration } from '@lucid-agents/identity';

if (!agent.identity?.result) {
  throw new Error('Identity was not resolved');
}

const registration = generateAgentRegistration(agent.identity.result, {
  name: 'verified-agent',
  description: 'An ERC-8004 registered agent',
  selectedServices: ['A2A', 'web', 'OASF'],
  a2aEndpoint: 'https://agent.example/.well-known/agent-card.json',
  website: 'https://agent.example',
});
```

Host the returned JSON at the URI written on chain. OASF is separately served at
`/.well-known/oasf-record.json` when registration OASF metadata is configured.

OASF strict mode expects structured arrays for authors, skills, domains, modules,
and locators. Invalid serialized pseudo-arrays are rejected rather than silently
published.

## Low-level initialization

Use `createAgentIdentity` outside the extension when you intentionally manage
initialization yourself:

```ts
import { createAgentIdentity } from '@lucid-agents/identity';

const result = await createAgentIdentity({
  runtime: agentWithWallets,
  domain: 'agent.example',
  autoRegister: true,
  chainId: 84532,
  rpcUrl: process.env.RPC_URL,
});
```

You may instead pass a wallet handle directly. The returned result includes:

- lookup/registration status and transaction hash;
- the identity record when found or registered;
- identity and reputation clients; validation is not created by default;
- trust metadata for an agent card;
- the resolved domain and whether this call registered the identity.

`registerAgent(options)` is the explicit auto-register convenience helper, and
`getTrustConfig(result)` extracts trust metadata for non-extension integrations.

## Registry clients

The identity client manages registration ownership and metadata. The reputation
client reads and submits ERC-8004 feedback. A validation client must be created
manually and is deprecated while that registry is revised. All writes use the
configured wallet; reads use the configured RPC client.

```ts
const clients = agent.identity?.result?.clients;
if (clients) {
  const summary = await clients.reputation.getSummary(42n);
  const record = await clients.identity.get(42n);
  console.log(summary, record?.owner);
}
```

Treat identity token transfer and registry writes as irreversible blockchain
operations. Validate the chain, contract addresses, token ID, and destination
before submitting them.

## Types and ownership

Shared trust, registration, OASF, and runtime contracts are defined in
`@lucid-agents/types/identity`. The package owns a single `IdentityConfig` used
by both `identityFromEnv` and `identity()`.

The identity extension owns all identity initialization and discovery
contribution. Core and framework adapters consume its runtime slice directly and
must not synthesize parallel trust or OASF state.
