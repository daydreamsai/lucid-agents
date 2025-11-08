# Examples

This directory contains runnable scripts that showcase different integration
patterns for `@lucid/agent-kit`:

## AxFlow + createAxLLMClient

- Demonstrates how to instantiate an Ax LLM client with payments enabled and run
  an AxFlow pipeline inside an agent entrypoint.
- Provides a graceful fallback when the underlying Ax credentials are missing.

Run the script with Bun:

```bash
bun run examples/ax-flow.ts
```

Environment variables consumed by the example:

```
OPENAI_API_KEY   # API key forwarded to @ax-llm/ax
PRIVATE_KEY      # Wallet key used by x402 to sign requests
PORT             # Optional; defaults to 3000
```

The agent exposes a single `/entrypoints/brainstorm/invoke` route that accepts a
`topic` string and responds with a summary plus a few follow-up ideas.

## Full-Stack Agent Example

This script contains a minimal, end-to-end showcase of everything
`@lucid/agent-kit` offers:

- Building an agent server with `createAgentApp`, including streaming entrypoints.
- Enabling x402 monetisation and surfacing the AP2 capability extension.
- Registering on the ERC-8004 Identity Registry, signing domain ownership proofs, and wiring the resulting trust metadata into the manifest.
- Fetching the generated AgentCard to verify that trust, payments, and schema metadata are emitted correctly.
- Ready to pair with `@lucid-agents/agent-auth` when you need authenticated wallet flows.

> The example is intentionally self-contained and uses viem-style clients. Install the peer tooling you need (e.g. `viem`) before running it locally.

Run the script with Bun:

```bash
bun run examples/full-agent.ts
```

Environment variables consumed by the example:

```
FACILITATOR_URL              # x402 facilitator endpoint (defaults to https://facilitator.daydreams.systems)
PAYMENTS_RECEIVABLE_ADDRESS  # Receivable address that receives payments (EVM or Solana)
NETWORK                      # x402 network name (e.g. base-sepolia)
IDENTITY_REGISTRY_ADDRESS   # ERC-8004 registry contract (defaults to 0x7177a6867296406881E20d6647232314736Dd09A)
CHAIN_ID          # Numeric chain id (e.g. 84532 for Base Sepolia)
RPC_URL           # HTTPS RPC endpoint for the chosen chain
AGENT_DOMAIN      # Domain that will host your agent's well-known files (.well-known/agent-card.json and .well-known/agent-metadata.json)
PRIVATE_KEY       # Wallet private key for ERC-8004 registration and payments (required for registration)
AGENT_REF         # Agent reference used with the Lucid wallet API
API_BASE_URL      # Base URL for the Lucid agent API (defaults to https://localhost:8787)
AGENT_ORIGIN      # Override for the agent server origin (defaults to https://localhost:PORT)

# AgentRuntime challenge flow (optional but required for paid fetch)
LUCID_AGENT_BASE_URL        # Auth server base URL for challenge/exchange (falls back to API_BASE_URL)
LUCID_AGENT_AGENT_REF       # Agent ref to authenticate (falls back to AGENT_REF)
LUCID_AGENT_CREDENTIAL_ID   # Credential ID that will sign challenges
LUCID_AGENT_REFRESH_TOKEN   # Optional refresh token to seed the runtime cache
LUCID_AGENT_SCOPES          # Optional scopes (JSON array or comma-separated string)
AGENT_AUTH_PRIVATE_KEY      # Hex private key used to sign challenges (falls back to PRIVATE_KEY)
```

The script is broken into labelled sections so you can cherry-pick the pieces you need in your own projects.

When the AgentRuntime variables are present the script signs the Lucid
challenge, exchanges it for bearer + refresh tokens, and reuses the resulting
wallet session to wrap fetch requests with x402 payments. If the auth inputs are
missing, the example still runs but falls back to unsigned requests (you will
see a console warning).

## Agent Runtime Auth Loop

`runtime-auth.ts` spins up two local servers:

- a minimal agent powered by `createAgentApp` (single `echo` entrypoint)
- a mock Lucid auth/API surface that issues short-lived tokens and serves `/v1/agents`

It then boots `AgentRuntime.load` with a stub wallet signer, walks through the
authenticate → refresh loop, and calls both the generated `AgentApiClient` and
the agent entrypoint using the resolved bearer token.

Run it with Bun:

```bash
AGENT_REF=demo-agent CREDENTIAL_ID=cred-demo bun run examples/runtime-auth.ts
```

Optional environment variables:

```
AGENT_PORT   # Port for the demo agent (default 8789)
AUTH_PORT    # Port for the mock auth API (default 8790)
SCOPES       # Comma-separated scopes fed into the runtime (default agents.read)
```

Because the auth server is mocked, no real credentials are required—the
`signChallenge` implementation simply echoes the challenge ID.
