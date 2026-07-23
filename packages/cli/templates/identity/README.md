# {{AGENT_NAME}}

Generated Lucid service with wallet, payments, HTTP, and draft ERC-8004
identity/trust metadata.

ERC-8004 is Draft. Registration advertises an identity and service document; it
does not prove the service is safe, correct, available, or reputable.

## Review before running

The generated `.env` and `.env.example` use Base Sepolia (`CHAIN_ID=84532`)
with `IDENTITY_AUTO_REGISTER=false`. This default boots without a signer and
cannot submit an identity transaction. Copy the example only if you want to
reset the generated environment:

```bash
cp .env.example .env
```

Before deployment, set the intended `AGENT_DOMAIN`, `RPC_URL`, and `CHAIN_ID`.
Set `IDENTITY_AGENT_ID` to a known ERC-8004 token ID when startup should read
and expose its record and trust directly. When it is empty, read-only startup
fetches `AGENT_DOMAIN/.well-known/agent-registration.json`, selects the entry
matching `CHAIN_ID` and the identity registry address, then verifies that ID
on-chain. This is bounded domain-document discovery, not an on-chain reverse
lookup.
Set `AGENT_WALLET_TYPE=local` plus `AGENT_WALLET_PRIVATE_KEY` only when an
identity operation needs that signer. Keep `IDENTITY_AUTO_REGISTER=false` until
you have verified the chain, registry address, domain/agent URI, gas funding,
and on-chain side effect. The wizard does not request or emit signer secrets in
its default read-only flow; it asks for the agent key only after registration is
explicitly enabled. The generated runtime binds local agent and developer
signers to this same `RPC_URL` and `CHAIN_ID`, so registry reads, gas checks, and
registration cannot silently fall back to a localhost wallet chain.

Ethereum mainnet (`CHAIN_ID=1`) registration has an additional startup
preflight. A mainnet run requires all three settings:

```dotenv
CHAIN_ID=1
IDENTITY_AUTO_REGISTER=true
IDENTITY_ALLOW_MAINNET_REGISTRATION=true
```

The last setting is an acknowledgement, not a safety guarantee. Startup still
requires a local agent or developer signing key. It derives the exact signer
address and checks that address has a nonzero native-token balance through
`RPC_URL`; an unreadable or zero balance fails before registration. A nonzero
balance does not guarantee the eventual transaction fee, so inspect current gas
conditions as part of the reviewed registration run.

Payment receiving is independent and disabled by default. Set
`PAYMENTS_ENABLED=true` and configure the full `PAYMENTS_*` group only for
priced entrypoints.

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

if (!result) {
  throw new Error('Identity clients were not initialized');
}

export const identityClient = result.clients?.identity;
export const reputationClient = result.clients?.reputation;

// Populated from IDENTITY_AGENT_ID or the verified domain registration document.
const knownRecord = result.record;
```

Identity and reputation clients may be available after successful registry
setup. The validation client is deprecated and is not created by default.
HTTP(S) on-chain agent URIs must share the configured domain origin. A missing
or invalid domain document never enables a write or produces trust. A missing
explicit ID never causes registration of a replacement token. The scaffold
fails closed for non-HTTP or malformed on-chain URIs because it cannot verify
their relationship to `AGENT_DOMAIN`.

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
- Keep automatic registration disabled during normal application restarts.
- Require reviewed `IDENTITY_ALLOW_MAINNET_REGISTRATION=true` only for an
  intentional Ethereum mainnet registration run.
- Use a secret manager and test key rotation/revocation.
- Pin and verify chain/registry contracts; do not trust an RPC response alone.
- Publish/fetch the registration and Agent Card through the real proxy/origin.
- Treat registration and reputation as signals, not authorization.
- Keep payments/idempotency durable before multiple replicas.
- Call the runtime close path during graceful shutdown.

See `AGENTS.md` for the generated composition and repository docs for the exact
draft ERC-8004, wallet, environment, and release-channel contracts.
