# @lucid-agents/core

`@lucid-agents/core` is the core runtime for building AI agents with typed entrypoints, discovery endpoints, monetization hooks, and trust metadata. It provides the shared runtime logic used by adapter packages like `@lucid-agents/hono` and `@lucid-agents/tanstack`.

**Note:** For most use cases, you'll want to use one of the adapter packages (`@lucid-agents/hono` or `@lucid-agents/tanstack`) rather than importing from this core package directly.

## Highlights

- Protocol-agnostic core runtime - not tied to any specific protocol (HTTP, WebSocket, etc.)
- Extension-based architecture - add features via `.use()` method
- Type-safe entrypoints with optional Zod input and output schemas.
- Automatic manifest building with extension hooks.
- Shared runtime configuration with environment + runtime overrides.
- ERC-8004 trust and AP2 manifest integration via extensions.
- Utilities for x402-enabled LLM calls, agent wallets, and identity registries.

**Note:** HTTP-specific functionality (handlers, invoke, stream) is provided by the `@lucid-agents/http` extension, not the core package.

## Install & Import

This is the core runtime package. For building agents, use one of the adapter packages:

**Hono Adapter:**

```ts
import { createAgentApp } from '@lucid-agents/hono';
import type { EntrypointDef, AgentMeta } from '@lucid-agents/core';
```

**Express Adapter:**

```ts
import { createAgentApp } from '@lucid-agents/express';
import type { EntrypointDef, AgentMeta } from '@lucid-agents/core';
```

**TanStack Adapter:**

```ts
import { createTanStackRuntime } from '@lucid-agents/tanstack';
import type { EntrypointDef, AgentMeta } from '@lucid-agents/core';
```

Subpath exports (shared across adapters):

- `@lucid-agents/core` — main exports including types (EntrypointDef, AgentMeta, etc.)
- `@lucid-agents/core/utils` — focused helpers
- `@lucid-agents/core/axllm` — AxLLM client integration

## Core Concepts

### Core Runtime

This package provides the core runtime logic via an extension-based API. Use `createAgent()` to build a runtime with extensions, then pass it to adapter packages like `@lucid-agents/hono` and `@lucid-agents/tanstack`.

**Extension System:**

The runtime uses a modular extension system where features are added via `.use()`:

- `http()` — adds HTTP request handlers (required for HTTP adapters)
- `payments()` — adds x402 payment support
- `wallets()` — adds wallet management
- `identity()` — adds ERC-8004 identity and trust config
- `a2a()` — adds A2A Protocol support
- `ap2()` — adds AP2 extension metadata

**Building a Runtime:**

```ts
const agent = await createAgent({
  name: 'my-agent',
  version: '1.0.0',
  description: 'My agent',
})
  .use(http())
  .use(payments({ ... }))
  .use(identity({ ... }))
  .build();
```

**Using with Adapters:**

- `createAgentApp(runtime)` — returns Hono or Express app instance
- `createTanStackRuntime(runtime)` — returns TanStack runtime and handlers
- `runtime.entrypoints.add(def)` — register entrypoints at runtime

**Example with Hono Adapter:**

```ts
import { z } from 'zod';
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { createAgentApp } from '@lucid-agents/hono';

const agent = await createAgent({
  name: 'hello-agent',
  version: '0.1.0',
  description: 'Echoes whatever you pass in',
})
  .use(http())
  .build();

const { app, addEntrypoint } = createAgentApp(runtime);

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

**Example with Express Adapter:**

```ts
import { z } from 'zod';
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { createAgentApp } from '@lucid-agents/express';

const agent = await createAgent({
  name: 'hello-agent',
  version: '0.1.0',
  description: 'Echoes whatever you pass in',
})
  .use(http())
  .build();

const { app, addEntrypoint } = createAgentApp(runtime);

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

app.listen(process.env.PORT ?? 3000);
```

**Example with TanStack Adapter:**

```ts
import { z } from 'zod';
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { createTanStackRuntime } from '@lucid-agents/tanstack';

const agent = await createAgent({
  name: 'hello-agent',
  version: '0.1.0',
  description: 'Echoes whatever you pass in',
})
  .use(http())
  .build();

const { runtime, handlers } = createTanStackRuntime(appRuntime);

runtime.entrypoints.add({
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

const { agent } = runtime;
export { agent, handlers, runtime };
```

## Supported Networks

Lucid-agents supports payment receiving on multiple blockchain networks:

### EVM Networks

- `base` - Base mainnet (L2)
- `base-sepolia` - Base Sepolia testnet
- `ethereum` - Ethereum mainnet
- `sepolia` - Ethereum Sepolia testnet

### Solana Networks

- `solana` - Solana mainnet
- `solana-devnet` - Solana devnet

### Address Formats

- **EVM**: 0x-prefixed hex (42 characters) - e.g., `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0`
- **Solana**: Base58 encoding (~44 characters, no prefix) - e.g., `9yPGxVrYi7C5JLMGjEZhK8qQ4tn7SzMWwQHvz3vGJCKz`

### Example with Solana

```ts
const { app, addEntrypoint } = createAgentApp(
  {
    name: 'solana-agent',
    version: '1.0.0',
    description: 'Agent accepting Solana USDC payments',
  },
  {
    payments: {
      payTo: '9yPGxVrYi7C5JLMGjEZhK8qQ4tn7SzMWwQHvz3vGJCKz', // Solana address
      network: 'solana-devnet',
      facilitatorUrl: 'https://facilitator.daydreams.systems',
    },
  }
);

addEntrypoint({
  key: 'translate',
  description: 'Translate text',
  input: z.object({ text: z.string(), target: z.string() }),
  async handler({ input }) {
    // Your translation logic
    return {
      output: { translated: `Translated: ${input.text}` },
    };
  },
});
```

### SPL Token Addresses

For Solana payments, USDC addresses are:

- **Mainnet USDC**: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- **Devnet USDC**: `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr`

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

`core` keeps configuration centralized so every helper resolves the same values.

- Defaults live in `src/config.ts` (currently empty placeholders).
- Environment variables flow in via the extension helpers (`paymentsFromEnv()` and `walletsFromEnv()`).
- `configureAgentKit(overrides)` merges values at runtime; use it inside tests or before calling `createAgentApp`.
- `getAgentKitConfig()` returns the resolved values; `resetAgentKitConfigForTesting()` clears overrides.

The helper `paymentsFromEnv()` returns the currently resolved `PaymentsConfig`, honouring inline config and environment values. `walletsFromEnv()` follows the same pattern.

```ts
import {
  configureAgentKit,
  getAgentKitConfig,
  paymentsFromEnv,
} from '@lucid-agents/core';

configureAgentKit({
  payments: {
    facilitatorUrl: 'https://facilitator.example',
    payTo: '0x...',
    network: 'base-sepolia',
  },
  wallets: {
    agent: {
      type: 'local',
      privateKey: '0xabc...',
    },
  },
});

const config = getAgentKitConfig();
console.log(config.payments?.facilitatorUrl); // resolved facilitator
console.log(config.wallets?.agent?.type); // 'local'
console.log(paymentsFromEnv()); // reuse inside handlers
```

## Payments & Monetization

The `payments()` extension enables receiving payments via the x402 protocol and provides bi-directional payment tracking with persistent storage. When payments are configured, the adapter automatically wraps invoke/stream routes with x402 payment middleware.

**To receive payments, you need:**

1. **Payments extension** - Add `.use(payments({ config: {...} }))` to enable payment processing
2. **AP2 extension (optional)** - Add `.use(ap2({ roles: ['merchant'] }))` to advertise payment capabilities in the manifest

**Important:** Payments and AP2 are independent extensions. The payments extension handles payment processing, while AP2 advertises payment roles in the manifest for discovery. If you want to participate in the AP2 ecosystem (advertise as merchant/shopper), you must explicitly add the AP2 extension.

### Payment Tracking & Policies

The payments extension provides:

- **Bi-directional tracking** - Track both outgoing payments (agent pays) and incoming payments (agent receives)
- **Persistent storage** - Multiple storage backends (SQLite, In-Memory, Postgres) for different deployment scenarios
- **Payment policies** - Enforce limits and controls on both outgoing and incoming payments
- **Automatic recording** - Payments are automatically tracked when using `fetchWithPayment` or when receiving payments

See [`@lucid-agents/payments` documentation](../payments/README.md) for complete examples, storage options, and API reference.

### Pricing

- Each entrypoint must explicitly define its `price` (string or `{ invoke?, stream? }` object)
- If no price is set, the entrypoint is free (no paywall)

`resolvePrice(entrypoint, payments, kind)` (from `@lucid-agents/payments`) returns the price or `null`.

For authenticated wallet access, pair your agent with
`@lucid-agents/agent-auth` and reuse the generated SDK surface:

```ts
import { AgentRuntime } from '@lucid-agents/agent-auth';
import { createRuntimePaymentContext } from '@lucid-agents/payments';

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

The manifest is automatically generated by `createAgentApp` using the A2A protocol base card and enhancement functions for payments, identity, and AP2 extensions. It produces an A2A-compatible AgentCard that includes:

- `skills[]` mirroring entrypoints and their schemas.
- `capabilities.streaming` when any entrypoint offers SSE.
- `payments[]` with x402 metadata when monetization is active (via `payments()` extension).
- AP2 extension entries when explicitly configured (via `ap2()` extension) - **required for AP2 ecosystem participation**.
- Trust metadata (`registrations`, `trustModels`, validation URIs) from `TrustConfig`.

**Note:** Payments and AP2 are separate extensions:

- **Payments extension** (`payments()`) - Handles actual payment processing via x402 protocol
- **AP2 extension** (`ap2()`) - Advertises payment roles (merchant/shopper) in the manifest for discovery

If you want to receive payments AND advertise payment capabilities, you need both extensions:

```ts
.use(payments({ config: {...} }))
.use(ap2({ roles: ['merchant'] }))
```

## Trust & Identity (ERC-8004)

Trust metadata is modelled by `TrustConfig`. For ERC-8004 identity management, use the dedicated `@lucid-agents/identity` package:

```ts
import { createAgentIdentity, getTrustConfig } from '@lucid-agents/identity';

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

See [`@lucid-agents/identity` documentation](../@lucid-agents/identity/README.md) for complete examples and API reference.

## Agent-to-Agent (A2A) Client

Agents can call other agents using the A2A protocol. The A2A client is available through the runtime:

```ts
import { createRuntimePaymentContext } from '@lucid-agents/payments';

addEntrypoint({
  key: 'delegate',
  handler: async ctx => {
    const runtime = ctx.runtime;
    if (!runtime?.a2a) {
      throw new Error('A2A client not available');
    }

    // Create payment-enabled fetch (optional)
    const paymentContext = await createRuntimePaymentContext({
      runtime,
      network: 'base-sepolia',
    });

    // Fetch worker agent's card
    const workerCard = await runtime.a2a.fetchCard(
      'https://worker.example.com',
      paymentContext.fetchWithPayment
    );

    // Call worker agent
    const result = await runtime.a2a.client.invoke(
      workerCard,
      'process',
      ctx.input.data,
      paymentContext.fetchWithPayment
    );

    return { output: { result: result.output } };
  },
});
```

### Convenience Functions

```ts
import { fetchAndInvoke } from '@lucid-agents/a2a';

// Fetch card and invoke in one call
const result = await fetchAndInvoke(
  'https://worker.example.com',
  'process',
  { data: [1, 2, 3] },
  fetchWithPayment // optional
);
```

See `examples/full-agent.ts` for a complete agent example, or use the `trading-data-agent` and `trading-recommendation-agent` CLI templates for A2A composition examples.

## x402 + AxFlow utilities

For downstream components that need to call LLMs with paid fetches, the utils folder exposes:

- `createX402Fetch({ account, fetchImpl })` and `accountFromPrivateKey(privateKey)` — wrap a fetch implementation with x402 payments.
- `createX402LLM(options)` — compose a paid fetch with `@ax-llm/ax`.
- `createAxLLMClient({ provider, model, apiKey, temperature, x402, logger })` — ergonomic wrapper that reads env defaults (`OPENAI_API_KEY`, `AX_*`, `AXLLM_*`) and falls back to gpt-5/OpenAI. It returns `{ ax, isConfigured }`.

## Miscellaneous utilities

- `toJsonSchemaOrUndefined(zodSchema)` — safe JSON-schema conversion.
- `normalizeAddress`, `sanitizeAddress`, `toCaip10` — address manipulation helpers used by the trust layer.
- `defaults` — exported constants describing the built-in facilitator URL, pay-to address, network, and API base URL.
