# {{AGENT_NAME}}

Generated Lucid service with wallet, payments, HTTP, and draft ERC-8004
identity/trust metadata.

ERC-8004 is Draft. Registration advertises an identity and service document; it
does not prove the service is safe, correct, available, or reputable.

## Review before running

Copy and edit the environment file:

```bash
cp .env.example .env
```

At minimum, set the intended `AGENT_DOMAIN`, `RPC_URL`, and `CHAIN_ID`. Set
`AGENT_WALLET_TYPE=local` plus `AGENT_WALLET_PRIVATE_KEY` only when the identity
operation needs that signer. Keep `IDENTITY_AUTO_REGISTER=false` until you have
verified the chain, registry address, domain/agent URI, gas funding, and
on-chain side effect.

Payment receiving is independent. Configure the full `PAYMENTS_*` group only
for priced entrypoints.

## Run and verify

```bash
bun install
bun run type-check
bun run build
bun run dev
```

Verify the adapter's health route and fetch:

```bash
curl -i http://localhost:3000/.well-known/agent-card.json
curl -i http://localhost:3000/.well-known/oasf-record.json
```

The runtime may use `/api/agent` for TanStack/Next. The registration document
must be hosted at the exact `agentURI` recorded on-chain, commonly:

```text
https://agent.example.com/.well-known/agent-registration.json
```

Printing a document locally is not proof that the public URI serves it.

## Identity runtime

Read the extension result instead of bootstrapping identity a second time:

```ts
const result = agent.identity?.result;

if (!result?.record) {
  throw new Error('Required identity was not resolved');
}

export const identityClient = result.clients?.identity;
export const reputationClient = result.clients?.reputation;
```

Identity and reputation clients may be available after successful registry
setup. The validation client is deprecated and is not created by default.

Domain proof helpers are standalone exports (`buildDomainProofMessage()` and
`signDomainProof()`), not methods on `agent.identity`.

## Registration services and OASF

Enable only services you actually host. The package name includes `a2a`, but
the generated Agent Card/Lucid task profile is not the official A2A v1 binding.

When `IDENTITY_INCLUDE_OASF=true`, all five authors/skills/domains/modules/
locators JSON arrays in `.env.example` are required; module and locator values
must be valid URIs.

## Production boundary

- Separate the identity signer from buyer/admin wallets where possible.
- Use a secret manager and test key rotation/revocation.
- Pin and verify chain/registry contracts; do not trust an RPC response alone.
- Publish/fetch the registration and Agent Card through the real proxy/origin.
- Treat registration and reputation as signals, not authorization.
- Keep payments/idempotency durable before multiple replicas.
- Call the runtime close path during graceful shutdown.

See `AGENTS.md` for the generated composition and repository docs for the exact
draft ERC-8004, wallet, environment, and release-channel contracts.
