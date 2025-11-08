# @lucid-agents/agent-kit

`@lucid-agents/agent-kit` is a lightweight wrapper around [Hono](https://hono.dev) that turns a plain HTTP server into an agent surface with fully typed entrypoints, discovery endpoints, monetization hooks, and trust metadata. Use it to describe agent capabilities once and let adapters across the monorepo serve them consistently.

## Highlights

- Type-safe entrypoints with optional Zod input and output schemas.
- Automatic `/health`, `/entrypoints`, and AgentCard manifest routes.
- Built-in Server-Sent Events (SSE) streaming helpers.
- Optional x402 monetization and per-entrypoint pricing/network overrides.
- Shared runtime configuration with environment + runtime overrides.
- ERC-8004 trust and AP2 manifest integration out of the box.
- Utilities for x402-enabled LLM calls, agent wallets, and identity registries.

## Install & Import

This package is part of the monorepo. From sibling workspaces import:

```ts
import { createAgentApp, paymentsFromEnv } from '@lucid-agents/agent-kit';
import type { EntrypointDef, AgentMeta } from '@lucid-agents/agent-kit/types';
```

Subpath exports:

- `@lucid-agents/agent-kit` — main API surface (apps, payments, trust helpers, utilities).
- `@lucid-agents/agent-kit/types` — public TypeScript interfaces and helper types.
- `@lucid-agents/agent-kit/utils` — focused helpers (`toJsonSchemaOrUndefined`, `paymentsFromEnv`, address utilities, etc.).

## Core Concepts

### `createAgentApp(meta, options?)`

`createAgentApp` constructs a Hono app, manages an in-memory registry of entrypoints, and resolves configuration before any requests are served.

- `meta` (`AgentMeta`) shapes the health check and manifest.
- `options.config` applies runtime overrides for payments and wallet defaults. These overrides merge with environment variables and package defaults via `getAgentKitConfig`.
- `options.payments` forces a `PaymentsConfig` for all routes. Pass `false` to explicitly disable paywalling even when config/env values exist.
- `options.ap2` promotes an Agent Payments Protocol extension entry into the manifest.
- `options.trust` pushes ERC-8004 trust metadata into the manifest.
- `options.entrypoints` pre-registers entrypoints without additional calls.
- `options.useConfigPayments` instructs the server to reuse resolved config defaults when `options.payments` is omitted.

The return value exposes:

- `app` — the underlying Hono instance you can serve with Bun, Cloudflare Workers, etc.
- `addEntrypoint(def)` — register more entrypoints at runtime.
- `config` — the resolved `ResolvedAgentKitConfig` after env and runtime overrides.
- `payments` — the active `PaymentsConfig` (if paywalling is enabled) or `undefined`.

```ts
import { z } from 'zod';
import { createAgentApp } from '@lucid-agents/agent-kit';

const { app, addEntrypoint } = createAgentApp({
  name: 'hello-agent',
  version: '0.1.0',
  description: 'Echoes whatever you pass in',
});

addEntrypoint({
  key: 'echo',
  description: 'Echo a message',
  input: z.object({ text: z.string() }),
  async handler({ input }) {
    return {
      output: { text: String(input.text ?? '') },
      usage: { total_tokens: String(input.text ?? '').length },
    };
  },
});

export default app;
```

### Entrypoints

`EntrypointDef` describes a unit of work. Each entrypoint becomes two HTTP endpoints:

- `POST /entrypoints/:key/invoke` — always available; returns JSON `{ run_id, status, output?, usage?, model? }`.
- `POST /entrypoints/:key/stream` — only registered when `streaming` and `stream` are provided; streams `run-start`, `delta`, `text`, `asset`, `control`, `error`, and `run-end` events over SSE.

Field highlights:

- `input` / `output` accept Zod schemas and automatically drive validation and manifest JSON schema generation.
- `handler(ctx)` handles non-streaming invocations.
- `stream(ctx, emit)` emits `StreamPushEnvelope`s and finishes with a `StreamResult`.
- `price` accepts either a single string or `{ invoke?, stream? }`; `network` can override the global payment network per entrypoint.

```ts
addEntrypoint({
  key: 'stream',
  description: 'Streams characters back to the caller',
  input: z.object({ prompt: z.string() }),
  streaming: true,
  price: { stream: '2500' },
  async stream({ input }, emit) {
    for (const ch of input.prompt ?? '') {
      await emit({ kind: 'delta', delta: ch, mime: 'text/plain' });
    }
    return { output: { done: true } };
  },
});
```

### HTTP routes

Every agent app exposes the following for free:

- `GET /health` → `{ ok: true, version }`
- `GET /entrypoints` → `{ items: Array<{ key, description?, streaming }> }`
- `GET /.well-known/agent.json` and `/.well-known/agent-card.json` → full manifest (skills, schemas, pricing, trust metadata, AP2 extension, etc.)
- `POST /entrypoints/:key/invoke` and (optional) `POST /entrypoints/:key/stream` as described above.
- `GET /` → lightweight HTML page that renders the manifest (handy for local inspection).

## Configuration & Environment

`agent-kit` keeps configuration centralized so every helper resolves the same values.

- Defaults live in `src/config.ts` (facilitator, pay-to address, network, wallet API).
- Environment variables override defaults automatically: `FACILITATOR_URL`, `PAYMENTS_RECEIVABLE_ADDRESS`, `NETWORK`, `DEFAULT_PRICE`, `LUCID_API_URL`/`VITE_API_URL`, `AGENT_WALLET_MAX_PAYMENT_BASE_UNITS`, and `AGENT_WALLET_MAX_PAYMENT_USDC`.
- `configureAgentKit(overrides)` merges values at runtime; use it inside tests or before calling `createAgentApp`.
- `getAgentKitConfig()` returns the resolved values; `resetAgentKitConfigForTesting()` clears overrides.

The helper `paymentsFromEnv({ defaultPrice? })` returns the currently resolved `PaymentsConfig`, honouring inline config and environment values.

```ts
import {
  configureAgentKit,
  getAgentKitConfig,
  paymentsFromEnv,
} from '@lucid-agents/agent-kit';

configureAgentKit({
  payments: { defaultPrice: '750' },
  wallet: { walletApiUrl: 'https://wallets.example' },
});

const config = getAgentKitConfig();
console.log(config.payments.facilitatorUrl); // resolved facilitator
console.log(config.wallet.walletApiUrl); // resolved wallet API base URL
console.log(paymentsFromEnv({ defaultPrice: '1000' })); // reuse inside handlers
```

## Payments & Monetization

When a `PaymentsConfig` is active, `createAgentApp` automatically wraps invoke/stream routes with the `x402-hono` middleware via `withPayments`. Pricing resolution order:

1. `entrypoint.price` (string or object).
2. `PaymentsConfig.defaultPrice` (from inline config/env).
3. No paywall if neither is defined.

`resolveEntrypointPrice(entrypoint, payments, kind)` encapsulates the merge logic.

For authenticated wallet access, pair your agent with
`@lucid-agents/agent-auth` and reuse the generated SDK surface:

```ts
import { AgentRuntime } from '@lucid-agents/agent-auth';
import { createRuntimePaymentContext } from '@lucid-agents/agent-kit';

const { runtime } = await AgentRuntime.load({
  wallet: {
    signer: {
      async signChallenge(challenge) {
        // sign however your environment requires
        return `signed:${challenge.id}`;
      },
    },
  },
  loader: {
    overrides: {
      baseUrl: process.env.LUCID_API_URL,
      agentRef: process.env.AGENT_REF,
      credentialId: process.env.CREDENTIAL_ID,
      scopes: ['agents.read'],
    },
  },
});

const token = await runtime.ensureAccessToken();
const agents = await runtime.api.listAgents();
console.log('active bearer token', token.slice(0, 12), agents.items.length);

// Wrap fetch with x402 payments using the runtime-managed wallet
const { fetchWithPayment } = await createRuntimePaymentContext({
  runtime,
});

const paidResponse = await fetchWithPayment?.('https://paid.endpoint/api', {
  method: 'POST',
  body: JSON.stringify({ prompt: 'charge me' }),
  headers: { 'content-type': 'application/json' },
});
console.log('paid response', await paidResponse?.json());
```

## Manifest, AP2, and Discovery

`buildManifest({ meta, registry, origin, payments, ap2, trust })` powers the well-known endpoints. It produces an A2A-compatible AgentCard that includes:

- `skills[]` mirroring entrypoints and their schemas.
- `capabilities.streaming` when any entrypoint offers SSE.
- `payments[]` with x402 metadata when monetization is active.
- AP2 extension entries when `ap2` is supplied or when payments are enabled (defaults to a required merchant role).
- Trust metadata (`registrations`, `trustModels`, validation URIs) from `TrustConfig`.

You rarely need to call `buildManifest` directly; `createAgentApp` handles it automatically, but the function is exported when you want to generate manifests for static hosts.

## Trust & Identity (ERC-8004)

Trust metadata is modelled by `TrustConfig`. For ERC-8004 identity management, use the dedicated `@lucid-agents/agent-kit-identity` package:

```ts
import {
  createAgentIdentity,
  getTrustConfig,
} from '@lucid-agents/agent-kit-identity';

// Register agent identity with auto-registration
const identity = await createAgentIdentity({
  domain: 'agent.example.com',
  autoRegister: true,
  chainId: 84532,
  trustModels: ['feedback', 'inference-validation'],
});

// Use in your agent app
const { app } = createAgentApp(
  { name: 'my-agent', version: '1.0.0' },
  { trust: getTrustConfig(identity) }
);

console.log(`Agent ID: ${identity.record?.agentId}`);
console.log(`Status: ${identity.status}`);
```

The package also exports lower-level helpers for advanced use cases:

- `createIdentityRegistryClient({ address, chainId, publicClient, walletClient })` — direct registry access for advanced workflows.
- `signAgentDomainProof({ domain, address, chainId, signer })` — manually sign domain ownership proofs.
- `buildTrustConfigFromIdentity(record, { signature, chainId, namespace, trustOverrides })` — convert registry records into `TrustConfig`.

See [`@lucid-agents/agent-kit-identity` documentation](../agent-kit-identity/README.md) for complete examples and API reference.

## x402 + AxFlow utilities

For downstream components that need to call LLMs with paid fetches, the utils folder exposes:

- `createX402Fetch({ account, fetchImpl })` and `accountFromPrivateKey(privateKey)` — wrap a fetch implementation with x402 payments.
- `createX402LLM(options)` — compose a paid fetch with `@ax-llm/ax`.
- `createAxLLMClient({ provider, model, apiKey, temperature, x402, logger })` — ergonomic wrapper that reads env defaults (`OPENAI_API_KEY`, `AX_*`, `AXLLM_*`) and falls back to gpt-5/OpenAI. It returns `{ ax, isConfigured }`.

## Miscellaneous utilities

- `toJsonSchemaOrUndefined(zodSchema)` — safe JSON-schema conversion.
- `normalizeAddress`, `sanitizeAddress`, `toCaip10` — address manipulation helpers used by the trust layer.
- `defaults` — exported constants describing the built-in facilitator URL, pay-to address, network, and API base URL.
