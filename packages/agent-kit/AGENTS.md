# @lucid/agent-kit

A tiny helper to build agent HTTP apps with Hono:

- Typed entrypoints with optional Zod input/output schemas.
- Auto-generated introspection manifest and entrypoint listing.
- Optional streaming over Server-Sent Events (SSE).
- Optional x402 monetization per entrypoint.
- Optional Agent Payments Protocol (AP2) extension metadata in the AgentCard.

## Install & Import

This package is part of the monorepo. From other workspaces, import:

```ts
import { createAgentApp, paymentsFromEnv } from "@lucid/agent-kit";
import type { EntrypointDef, AgentMeta } from "@lucid/agent-kit/types";
import type { AP2Config } from "@lucid/agent-kit/types";
```

Subpath exports are available:

- `@lucid/agent-kit` — main API
- `@lucid/agent-kit/types` — public types
- `@lucid/agent-kit/utils` — helpers (e.g., `toJsonSchemaOrUndefined`, `paymentsFromEnv`)

## Quick Start

### Minimal agent

All you need is the agent metadata and at least one entrypoint. You can leave
payments/AP2/trust for later.

```ts
import { z } from "zod";
import { createAgentApp } from "@lucid/agent-kit";

const { app, addEntrypoint } = createAgentApp({
  name: "hello-agent",
  version: "0.1.0",
  description: "Echoes whatever you pass in",
});

addEntrypoint({
  key: "echo",
  description: "Echo a message",
  input: z.object({ text: z.string() }),
  async handler(ctx) {
    const text = String(ctx.input.text ?? "");
    return {
      output: { text },
      usage: { total_tokens: text.length },
    };
  },
});

export default app; // adapters can import the default
// Bun.serve({ fetch: app.fetch, port: 3000 }); // or serve inline
```

### Inline configuration (payments, wallets, AP2, trust)

`createAgentApp` accepts an optional second argument that drives all runtime
configuration. Passing a `config` block lets you avoid sprinkling `process.env`
calls across your app — the values are stored for the entire agent runtime, and
helpers such as `paymentsFromEnv()` will reuse
them automatically.

```ts
import { z } from "zod";
import { createAgentApp } from "@lucid/agent-kit";

const { app, addEntrypoint } = createAgentApp(
  {
    name: "paid-agent",
    version: "0.2.0",
    description: "Demonstrates payments + streaming",
  },
  {
    config: {
      payments: {
        facilitatorUrl: "https://facilitator.example",
        payTo: "0xabc0000000000000000000000000000000000000",
        network: "base-sepolia",
        defaultPrice: "1000",
      },
      wallet: {
        apiBaseUrl: "https://api.example",
      },
    },
    useConfigPayments: true, // apply the config payments to every entrypoint
    ap2: { roles: ["merchant", "shopper"] },
    trust: {
      trustModels: ["feedback"],
      registrations: [{ agentId: 1, agentAddress: "eip155:8453:0xabc" }],
    },
  }
);

addEntrypoint({
  key: "echo",
  input: z.object({ text: z.string() }),
  async handler(ctx) {
    return { output: { text: ctx.input.text } };
  },
});

addEntrypoint({
  key: "stream",
  description: "Streams characters back to the caller",
  input: z.object({ prompt: z.string() }),
  streaming: true,
  async stream(ctx, emit) {
    for (const ch of String(ctx.input.prompt ?? "")) {
      await emit({ kind: "delta", delta: ch, mime: "text/plain" });
    }
    return { output: { done: true } };
  },
});
```

> ℹ️ Environment variables (`FACILITATOR_URL`, `ADDRESS`, `NETWORK`,
> `DEFAULT_PRICE`, `LUCID_API_URL`, etc.) are still respected. Values supplied
> via `config` simply override the resolved defaults.

### Using the configured payments elsewhere

The configuration is shared across the package. For example, the payments helper
will reuse the values you passed to `createAgentApp`:

```ts
import { paymentsFromEnv } from "@lucid/agent-kit";

const payments = paymentsFromEnv(); // returns the config you supplied earlier
```

For wallet-authenticated calls, pair your agent with
`@lucid-dreams/agent-auth` and reuse its `AgentRuntime` helpers instead of the
now-removed `createAgentPaymentContext` flow.
`createRuntimePaymentContext({ runtime })` will hand you the same x402-enabled
fetch + signer wiring backed by the agent wallet.

## Routes

- `/health` — `{ ok: true, version }`
- `/entrypoints` — `{ items: Array<{ key, description?, streaming }> }`
- `/.well-known/agent.json` — Manifest with schemas and pricing (if configured)
  - Alias: `/.well-known/agent-card.json` (A2A preferred well-known path)
  - Includes `skills[]` for A2A, back-compat `entrypoints` block, and `payments[]` when configured.
  - Includes `capabilities.extensions` entry advertising AP2 when `ap2` or `payments` are configured.
- `/entrypoints/:key/invoke` — POST `{ input }` → `{ run_id, status, output?, usage?, model? }`
- `/entrypoints/:key/stream` — POST `{ input }` → SSE stream
  - Events: `run-start`, `delta`, `text`, `asset`, `control`, `error`, `run-end`

## Manifest

`/.well-known/agent.json` is derived from registered entrypoints:

- `entrypoints[key].streaming` — whether streaming is available
- `input_schema` / `output_schema` — derived from Zod (if provided)
- `pricing` — `{ invoke?, stream? }` when payments are configured
- `payments[]` — vendor-neutral payments: `[{ method: 'x402', payee, network, endpoint?, priceModel? }]`
- `capabilities.extensions[]` — includes AP2 descriptor `{ uri: 'https://github.com/google-agentic-commerce/ap2/tree/v0.1', params: { roles }, required? }`
- `registrations[]` — optional ERC-8004 identity attestations (`agentId`, CAIP-10 `agentAddress`, optional `signature`)
- `trustModels[]` — enumerate supported trust tiers (e.g. `feedback`, `inference-validation`, `tee-attestation`)
- `ValidationRequestsURI` / `ValidationResponsesURI` / `FeedbackDataURI` — off-chain mirrors for validation and feedback payloads

### ERC-8004 Trust Layer (Phase 1 Foundations)

`createAgentApp(meta, { trust })` now accepts a `TrustConfig` so you can surface trust metadata without wiring the registries yet. Start by collecting:

- Identity registrations (`registrations`) from the chains you participate in.
- Supported trust models (`trustModels`) that callers can rely on when matchmaking.
- Pointers to off-chain validation + feedback data stores.

Phases 2–4 will add helpers for on-chain registration, reputation/validation plumbing, and a full demo agent. For now, agents can statically declare trust details and update the manifest as their ERC-8004 integration evolves.

### ERC-8004 Identity Helpers (Prototype)

Pull in `createIdentityRegistryClient` from `@lucid/agent-kit/erc8004` to read/write the registry with whichever viem/ethers client you already use:

```ts
import {
  createIdentityRegistryClient,
  signAgentDomainProof,
} from "@lucid/agent-kit/erc8004";
import type { TrustConfig } from "@lucid/agent-kit/types";

const identity = createIdentityRegistryClient({
  address: "0xRegistry",
  chainId: 84532,
  publicClient, // viem PublicClient-like (readContract)
  walletClient, // viem WalletClient-like (writeContract)
});

const { transactionHash } = await identity.register({
  domain: "agent.example.com",
  agentAddress: walletClient.account.address,
});

const record = await identity.resolveByDomain("agent.example.com");
```

Use `signAgentDomainProof` and `toCaip10` to produce the proof blob surfaced in `registrations[]`:

```ts
const signature = await signAgentDomainProof({
  domain: record.agentDomain,
  address: record.agentAddress,
  chainId: 84532,
  signer: agentSigner,
});

const trustConfig: TrustConfig = {
  registrations: [identity.toRegistrationEntry(record, signature)],
  trustModels: ["feedback"],
};
```

`buildTrustConfigFromIdentity` can shape a `TrustConfig` from a registry hit plus any URIs you already host today. TODOs for later phases are called out inline in `src/erc8004.ts` (e.g., parsing logs, caching, multi-chain fan-out).

## Types

```ts
import type {
  AgentMeta,
  AgentContext,
  EntrypointDef,
  PaymentsConfig,
  Usage,
  Manifest,
} from "@lucid/agent-kit/types";
```

Key shapes:

- `EntrypointDef`: `{ key, description?, input?, output?, streaming?, price?, network?, handler?, stream? }`
- `AgentContext`: `{ key, input, signal, headers, runId }`
- `PaymentsConfig`: `{ payTo, facilitatorUrl, network, defaultPrice? }`
- `CreateAgentAppOptions`: `{ config?, payments?, ap2?, trust?, entrypoints?, useConfigPayments? }`
- `CreateAgentAppReturn`: `{ app, addEntrypoint, config, payments }`

## Utils

- `paymentsFromEnv({ defaultPrice? })` → `PaymentsConfig | undefined`
  - Mirrors the active agent configuration (overrides + environment + defaults)
- `toJsonSchemaOrUndefined(zodSchema)` → JSON schema or `undefined` on failure

## Payments (x402)

If payments are enabled, the invoke/stream routes are automatically paywalled:

- Price resolution per entrypoint: `string | { invoke?, stream? }`, fallback to `defaultPrice`.
- Optional per-entrypoint `network` overrides the global one.
- Providing `useConfigPayments: true` applies the configured `payments` values to every entrypoint unless you override `price`/`network` directly on the entrypoint.

Required env for `paymentsFromEnv`:

- `FACILITATOR_URL` — x402 facilitator endpoint
- `ADDRESS` — pay-to address (EVM `0x...` or Solana address)
- `NETWORK` — supported network id (see `x402-hono`)

## Notes

- ESM + TypeScript-first. Declarations are emitted to `dist/`, but subpath exports target `src/` for dev ergonomics in-repo.
- Keep entrypoints small and focused; prefer explicit Zod schemas at boundaries.
- Errors are returned as JSON with `error.code` and `message` in invoke; streamed route emits `error` and then `end`.
