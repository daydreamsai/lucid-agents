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
import { createAgentApp, paymentsFromEnv } from '@lucid/agent-kit';
import type { EntrypointDef, AgentMeta } from '@lucid/agent-kit/types';
import type { AP2Config } from '@lucid/agent-kit/types';
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

const { app, addEntrypoint } = await createAgentApp(agent);

addEntrypoint({
  key: 'echo',
  description: 'Echo a message',
  input: z.object({ text: z.string() }),
  async handler(ctx) {
    const text = String(ctx.input.text ?? '');
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
import { z } from 'zod';
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';
import { ap2 } from '@lucid-agents/ap2';
import { identity } from '@lucid-agents/identity';
import { createAgentApp } from '@lucid-agents/hono';

const agent = await createAgent({
  name: 'paid-agent',
  version: '0.2.0',
  description: 'Demonstrates payments + streaming',
})
  .use(http())
  .use(
    payments({
      payTo: '0xabc0000000000000000000000000000000000000',
      network: 'base-sepolia',
      facilitatorUrl: 'https://facilitator.daydreams.systems',
    })
  )
  .use(ap2({ roles: ['merchant', 'shopper'] }))
  .use(
    identity({
      trustModels: ['feedback'],
      registrations: [{ agentId: 1, agentAddress: 'eip155:8453:0xabc' }],
    })
  )
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

addEntrypoint({
  key: 'echo',
  input: z.object({ text: z.string() }),
  async handler(ctx) {
    return { output: { text: ctx.input.text } };
  },
});

addEntrypoint({
  key: 'stream',
  description: 'Streams characters back to the caller',
  input: z.object({ prompt: z.string() }),
  streaming: true,
  async stream(ctx, emit) {
    for (const ch of String(ctx.input.prompt ?? '')) {
      await emit({ kind: 'delta', delta: ch, mime: 'text/plain' });
    }
    return { output: { done: true } };
  },
});
```

> ℹ️ Environment variables (`FACILITATOR_URL`, `PAYMENTS_RECEIVABLE_ADDRESS`, `NETWORK`,
> `DEFAULT_PRICE`, `LUCID_API_URL`, etc.) are still respected. Values supplied
> via `config` simply override the resolved defaults.

### Using the configured payments elsewhere

The configuration is shared across the package. For example, the payments helper
will reuse the values you passed to `createAgentApp`:

```ts
import { paymentsFromEnv } from '@lucid/agent-kit';

const payments = paymentsFromEnv(); // returns the config you supplied earlier
```

For wallet-authenticated calls, pair your agent with
`@lucid-agents/agent-auth` and reuse its `AgentRuntime` helpers instead of the
now-removed `createAgentPaymentContext` flow.
`createRuntimePaymentContext({ runtime })` will hand you the same x402-enabled
fetch + signer wiring backed by the agent wallet.

### Open Graph Tags for Discoverability

Agent landing pages automatically include Open Graph meta tags for better social sharing and x402scan discovery. Add optional `image`, `url`, and `type` fields to your `AgentMeta`:

```ts
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { createAgentApp } from '@lucid-agents/hono';

const agent = await createAgent({
  name: 'My AI Agent',
  version: '1.0.0',
  description: 'AI-powered image processing for $0.10 per request',
  image: 'https://my-agent.com/og-image.png', // Preview image (1200x630px recommended)
  url: 'https://my-agent.com', // Canonical URL
  type: 'website', // OG type (defaults to 'website')
})
  .use(http())
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);
```

**What this enables:**

- **x402scan discovery**: Agent directories can display your agent with a rich preview
- **Social sharing**: Links to your agent show preview cards on Twitter, Discord, Slack, etc.
- **Professional appearance**: Makes your agent look polished when shared

**Rendered HTML:**

```html
<meta property="og:title" content="My AI Agent" />
<meta property="og:description" content="AI-powered image processing..." />
<meta property="og:image" content="https://my-agent.com/og-image.png" />
<meta property="og:url" content="https://my-agent.com" />
<meta property="og:type" content="website" />
```

All fields are optional. If `url` is not provided, it defaults to the agent's origin. Headless agents (with `landingPage: false`) don't render these tags since they don't serve HTML.

## Routes

- `/health` — `{ ok: true, version }`
- `/entrypoints` — `{ items: Array<{ key, description?, streaming }> }`
- `/.well-known/agent.json` — Manifest with schemas and pricing (if configured)
  - Alias: `/.well-known/agent-card.json` (A2A preferred well-known path)
  - Includes `skills[]` for A2A, back-compat `entrypoints` block, and `payments[]` when configured.
  - Includes `capabilities.extensions` entry advertising AP2 when explicitly configured via `ap2()` extension.
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

## Agent-to-Agent (A2A) Client Support

Agents can now call other agents using the A2A protocol. The A2A client is available through the runtime in entrypoint handlers.

### Using A2A Client in Handlers

Access the A2A client via `ctx.runtime.a2a.client`:

```ts
addEntrypoint({
  key: 'delegate',
  input: z.object({ task: z.string(), data: z.unknown() }),
  output: z.object({ result: z.unknown() }),
  handler: async ctx => {
    // Access A2A client from runtime
    const a2aClient = ctx.runtime?.a2a?.client;
    if (!a2aClient) {
      throw new Error('A2A client not available');
    }

    // Fetch worker agent's card
    const workerCard = await a2aClient.fetchCard('https://worker.example.com');

    // Call worker agent
    const result = await a2aClient.invoke(
      workerCard,
      'process',
      ctx.input.data
    );

    return { output: { result: result.output } };
  },
});
```

### Payment-Enabled A2A Calls

To pay for agent calls, create a payment-enabled fetch using `createRuntimePaymentContext`:

```ts
import { createRuntimePaymentContext } from '@lucid-agents/payments';

handler: async ctx => {
  const runtime = ctx.runtime;
  if (!runtime) throw new Error('Runtime not available');

  // Create payment-enabled fetch
  const paymentContext = await createRuntimePaymentContext({
    runtime,
    network: 'base-sepolia',
  });

  // Use payment-enabled fetch for A2A calls
  const workerCard = await runtime.a2a?.fetchCard(
    'https://worker.example.com',
    paymentContext.fetchWithPayment
  );

  const result = await runtime.a2a?.client.invoke(
    workerCard,
    'process',
    ctx.input.data,
    paymentContext.fetchWithPayment
  );

  return { output: { result: result.output } };
};
```

### Payment Policy Enforcement

The payments extension supports policy groups for controlling payment behavior:

- **Spending Limits**: Per-request and total spending limits (global, per-target, or per-endpoint)
- **Recipient Controls**: Whitelist/blacklist of addresses or domains
- **Rate Limiting**: Limit number of payments per time window
- **Stateful Tracking**: In-memory tracking of spending and rate limits (resets on restart)

All policies are evaluated before payment is made. If any policy group fails, the payment is blocked.

#### Policy Groups Configuration

```ts
import { payments } from '@lucid-agents/payments';
import type { PaymentPolicyGroup } from '@lucid-agents/types/payments';

const policyGroups: PaymentPolicyGroup[] = [
  {
    name: 'Daily Spending Limit',
    spendingLimits: {
      global: {
        maxPaymentUsd: 10.0, // Max $10 per individual payment
        maxTotalUsd: 100.0, // Max $100 total per day
        windowMs: 24 * 60 * 60 * 1000, // 24 hours
      },
    },
  },
  {
    name: 'API Usage Policy',
    spendingLimits: {
      perTarget: {
        'https://trusted-api.example.com': {
          maxPaymentUsd: 5.0,
          maxTotalUsd: 50.0,
        },
      },
    },
    allowedRecipients: ['https://trusted-api.example.com'],
    rateLimits: {
      maxPayments: 100,
      windowMs: 60 * 60 * 1000, // Per hour
    },
  },
];

const agent = await createAgent({
  name: 'my-agent',
  version: '1.0.0',
})
  .use(
    payments({
      config: {
        ...paymentsFromEnv(),
        policyGroups,
      },
    })
  )
  .build();
```

#### Policy Hierarchy

Spending limits follow a hierarchy (most specific wins):

1. **Endpoint-level**: Full endpoint URL (e.g., `https://agent.example.com/entrypoints/process/invoke`)
2. **Target-level**: Agent domain/URL (e.g., `https://agent.example.com`)
3. **Global**: Applies to all payments

All policy groups must pass for a payment to be allowed. The first violation blocks the payment.

#### Environment Variable Configuration

Policy groups can also be configured via environment variables:

```bash
# JSON configuration (recommended for complex policies)
PAYMENT_POLICY_GROUPS_JSON='[{"name":"Daily Limit","spendingLimits":{"global":{"maxTotalUsd":100.0}}}]'

# Or individual policy groups via env vars
PAYMENT_POLICY_GROUP_0_NAME="Daily Limit"
PAYMENT_POLICY_GROUP_0_GLOBAL_MAX_TOTAL_USD=100.0
PAYMENT_POLICY_GROUP_0_GLOBAL_WINDOW_MS=86400000
```

See [`packages/core/examples/policy-agent.ts`](../core/examples/policy-agent.ts) for a complete example.

### Convenience Functions

The A2A client provides convenience functions:

```ts
import { fetchAndInvoke } from '@lucid-agents/a2a';

// Fetch card and invoke in one call
const result = await fetchAndInvoke(
  'https://worker.example.com',
  'process',
  { data: [1, 2, 3] },
  fetchWithPayment // optional payment-enabled fetch
);
```

### Example: Three-Agent Composition

See `examples/full-agent.ts` for a complete agent example, or use the `trading-data-agent` and `trading-recommendation-agent` CLI templates for A2A composition examples where an agent routes requests to other agents and pays for their services.

### ERC-8004 Identity Helpers (Prototype)

Pull in `createIdentityRegistryClient` from `@lucid/agent-kit/erc8004` to read/write the registry with whichever viem/ethers client you already use:

```ts
import {
  createIdentityRegistryClient,
  signAgentDomainProof,
} from '@lucid/agent-kit/erc8004';
import type { TrustConfig } from '@lucid/agent-kit/types';

const identity = createIdentityRegistryClient({
  address: '0xRegistry',
  chainId: 84532,
  publicClient, // viem PublicClient-like (readContract)
  walletClient, // viem WalletClient-like (writeContract)
});

const { transactionHash } = await identity.register({
  domain: 'agent.example.com',
  agentAddress: walletClient.account.address,
});

const record = await identity.resolveByDomain('agent.example.com');
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
  trustModels: ['feedback'],
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
} from '@lucid/agent-kit/types';
```

Key shapes:

- `EntrypointDef`: `{ key, description?, input?, output?, streaming?, price?, network?, handler?, stream? }`
- `AgentContext`: `{ key, input, signal, metadata?, runId?, runtime? }`
- `PaymentsConfig`: `{ payTo, facilitatorUrl, network }`
- `CreateAgentAppOptions`: `{ config?, payments?, ap2?, trust?, entrypoints? }`
- `CreateAgentAppReturn<TApp>`: `{ app: TApp, runtime, agent, addEntrypoint, config }` (generic type in `@lucid-agents/types/core`)

## Utils

- `paymentsFromEnv()` → `PaymentsConfig | undefined`
  - Loads payment configuration from environment variables
- `toJsonSchemaOrUndefined(zodSchema)` → JSON schema or `undefined` on failure

## Payments (x402)

If payments are enabled, the invoke/stream routes are automatically paywalled:

- Each entrypoint must have an explicit `price`: `string` or `{ invoke?, stream? }`
- Optional per-entrypoint `network` overrides the global one
- Pass `payments` option to enable payment infrastructure. Only entrypoints with `price` are paywalled.

Required env for `paymentsFromEnv`:

- `FACILITATOR_URL` — x402 facilitator endpoint
- `PAYMENTS_RECEIVABLE_ADDRESS` — receivable address that receives payments (EVM `0x...` or Solana address)
- `NETWORK` — supported network id (EVM or Solana)

### Supported Networks

**EVM Networks:**

- `base` - Base mainnet
- `base-sepolia` - Base Sepolia testnet
- `ethereum` - Ethereum mainnet
- `sepolia` - Ethereum Sepolia testnet

**Solana Networks:**

- `solana` - Solana mainnet
- `solana-devnet` - Solana devnet

### Solana Payment Configuration

Example configuration for accepting Solana payments:

```ts
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';
import { createAgentApp } from '@lucid-agents/hono';

const agent = await createAgent({
  name: 'solana-agent',
  version: '1.0.0',
  description: 'Agent accepting Solana USDC',
})
  .use(http())
  .use(
    payments({
      payTo: '9yPGxVrYi7C5JLMGjEZhK8qQ4tn7SzMWwQHvz3vGJCKz', // Solana Base58 address
      network: 'solana-devnet',
      facilitatorUrl: 'https://facilitator.daydreams.systems',
    })
  )
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

addEntrypoint({
  key: 'translate',
  price: '10000', // 0.01 USDC - explicit per entrypoint
  async handler({ input }) {
    // ...
  },
});
```

**SPL USDC Token Addresses:**

- Mainnet: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- Devnet: `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr`

**Address Formats:**

- EVM: 0x-prefixed hex (42 chars)
- Solana: Base58 encoding (~44 chars, no prefix)

### Identity vs Payment Networks

Important distinction:

- **Identity registration (ERC-8004)**: Requires EVM private key and EVM chain for on-chain registration
- **Payment receiving**: Can be any supported network (EVM or Solana)
- These are independent - you can register identity on Ethereum but receive payments on Solana

## Notes

- ESM + TypeScript-first. Declarations are emitted to `dist/`, but subpath exports target `src/` for dev ergonomics in-repo.
- Keep entrypoints small and focused; prefer explicit Zod schemas at boundaries.
- Errors are returned as JSON with `error.code` and `message` in invoke; streamed route emits `error` and then `end`.
