# @lucid-agents/payments

Bidirectional x402 payments, SIWX authentication, payment policies, and payment
tracking for Lucid Agents.

## Install

```bash
bun add @lucid-agents/payments @lucid-agents/core @lucid-agents/http
```

## Receive x402 payments

```ts
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { z } from 'zod';

const agent = await createAgent({ name: 'merchant', version: '1.0.0' })
  .use(payments({ config: paymentsFromEnv() }))
  .use(http())
  .addEntrypoint({
    key: 'quote',
    input: z.object({ symbol: z.string() }),
    output: z.object({ price: z.number() }),
    price: '0.01',
    handler: async ({ input }) => ({
      output: { price: input.symbol === 'ETH' ? 3_000 : 0 },
    }),
  })
  .build();
```

Prices are USD decimal strings. Use `{ invoke, stream }` when the two operations
have different prices. A free entrypoint has no price.

The HTTP extension owns one authorization flow for invoke, stream, and task
creation. The payments runtime first verifies x402 or SIWX and returns a stable
subject without reserving or settling. After an invoke wins its idempotency
claim, `admit()` evaluates incoming policies and reserves stateful limits.
`finalize()` settles after a successful invoke or successful stream/task
admission. Immediately before an irreversible settlement, policy accounting is
moved into a durable, non-expiring staged batch. Invalid input, failed invoke
output/handlers, failed admission, and failed settlement release provisional or
staged capacity; if final accounting fails after settlement, the staged batch
remains counted until reconciliation instead of expiring open. A later
asynchronous stream/task failure does not rewind an already accepted HTTP
operation. SIWX entitlements are checked before either x402 or MPP challenges,
so both rails support the same paid-entitlement reuse path.

## Configuration

```ts
payments({
  config: {
    payTo: '0xabc0000000000000000000000000000000000000',
    facilitatorUrl: 'https://facilitator.example',
    facilitatorAuth: process.env.FACILITATOR_AUTH,
    network: 'eip155:84532',
    storage: { type: 'in-memory' },
  },
});
```

Supported aliases normalize to CAIP-2 identifiers:

| Alias           | Canonical network |
| --------------- | ----------------- |
| `base`          | `eip155:8453`     |
| `base-sepolia`  | `eip155:84532`    |
| `ethereum`      | `eip155:1`        |
| `sepolia`       | `eip155:11155111` |
| `solana`        | `solana:mainnet`  |
| `solana-devnet` | `solana:devnet`   |

`paymentsFromEnv(overrides?, env?)` reads:

- `PAYMENTS_RECEIVABLE_ADDRESS`
- `FACILITATOR_URL` or `PAYMENTS_FACILITATOR_URL`
- `NETWORK` or `PAYMENTS_NETWORK`
- `FACILITATOR_AUTH` or `PAYMENTS_FACILITATOR_AUTH`
- `PAYMENTS_DESTINATION=stripe` and `STRIPE_SECRET_KEY` for Stripe mode

Pass an explicit `env` record in runtimes that do not expose `process.env`.
Configuration is validated when a priced or SIWX entrypoint activates payments.

## Storage boundaries

The root package is portable and defaults to isolated in-memory payment and SIWX
storage. Durable backends are opt-in subpaths; merely setting `type: 'sqlite'` or
`type: 'postgres'` without its factory fails closed.

### In memory (default)

```ts
payments({ config: { ...config } });
// Equivalent storage config: { type: 'in-memory' }
```

Use this for tests, edge-style runtimes, or intentionally ephemeral processes.

### SQLite

```ts
import {
  sqlitePaymentStorageFactory,
  sqliteSIWxStorageFactory,
} from '@lucid-agents/payments/storage/sqlite';

payments({
  config: {
    ...config,
    storage: { type: 'sqlite', sqlite: { dbPath: '.data/payments.db' } },
    siwx: {
      enabled: true,
      storage: { type: 'sqlite', sqlite: { dbPath: '.data/siwx.db' } },
    },
  },
  storageFactory: sqlitePaymentStorageFactory,
  siwxStorageFactory: sqliteSIWxStorageFactory,
});
```

### Postgres

Install the optional `pg` peer dependency and use an agent ID to isolate several
agents sharing one database:

```ts
import {
  postgresPaymentStorageFactory,
  postgresSIWxStorageFactory,
} from '@lucid-agents/payments/storage/postgres';

payments({
  agentId: 'merchant-production',
  config: {
    ...config,
    storage: {
      type: 'postgres',
      postgres: { connectionString: process.env.DATABASE_URL! },
    },
  },
  storageFactory: postgresPaymentStorageFactory,
  siwxStorageFactory: postgresSIWxStorageFactory,
});
```

All storage implementations provide atomic total/rate reservations and durable
staged settlement batches. Before payment, every applicable total, rate, and
history record moves into one non-expiring batch; after payment, that batch is
committed to history in one transaction. A post-settlement storage error leaves
the staged amount counted rather than partially applying accounting or failing
open after the reservation TTL. Authorization fails closed instead of making
tracking best-effort. `agent.close()` releases storage resources.

## Payment policies

Policy groups are conjunctive: every configured group must allow a payment.

```ts
payments({
  config: {
    ...config,
    policyGroups: [
      {
        name: 'daily-budget',
        outgoingLimits: {
          global: { maxPaymentUsd: 5, maxTotalUsd: 50, windowMs: 86_400_000 },
        },
        incomingLimits: {
          global: { maxPaymentUsd: 10, maxTotalUsd: 500 },
          perSender: {
            '0x1234567890123456789012345678901234567890': {
              maxTotalUsd: 25,
            },
          },
        },
        allowedRecipients: ['trusted.example'],
        blockedSenders: ['0xbad0000000000000000000000000000000000000'],
        rateLimits: { maxPayments: 100, windowMs: 3_600_000 },
      },
    ],
  },
});
```

Scopes are resolved from most specific to least specific: endpoint, target or
sender, then global. Incoming sender rules use only a cryptographically verified
payer address from x402 or MPP. `Origin`, `Referer`, and other caller-controlled
headers are never treated as sender identity. Outgoing recipient-domain rules
use the destination URL. Outgoing policies wrap the payment-aware Fetch path
even when no rate limit is configured.

MPP payments enter the same incoming policy and accounting transaction as x402.
An MPP verifier should return the verified `payer` and `network` when available;
the shared gate combines those with the challenged amount and currency. A
policy requiring sender or USD amount data fails closed if the verified payment
does not provide usable values.

Rate enforcement has one source of truth: the configured `PaymentStorage`.
`createRateLimiter()` remains available as a standalone process-local utility
for custom integrations, but the payments runtime does not maintain a second
rate counter beside its atomic storage reservations.

Node applications can load policy JSON with helpers from the Node entrypoint:

```ts
import { policiesFromConfig } from '@lucid-agents/payments/node';
```

## SIWX

SIWX can protect a free route or let a wallet reuse a paid entitlement:

```ts
const agent = await createAgent({ name: 'members', version: '1.0.0' })
  .use(
    payments({
      config: {
        ...config,
        siwx: {
          enabled: true,
          defaultStatement: 'Sign in to Members',
          expirationSeconds: 300,
          storage: { type: 'in-memory' },
        },
      },
    })
  )
  .use(http())
  .addEntrypoint({
    key: 'profile',
    siwx: { authOnly: true },
    handler: async ({ auth }) => ({ output: { address: auth?.address } }),
  })
  .addEntrypoint({
    key: 'report',
    price: '0.05',
    siwx: { enabled: true },
    handler: async ({ auth }) => ({ output: { address: auth?.address } }),
  })
  .build();
```

Nonces are consumed atomically. Replays, malformed signatures, expired payloads,
and resource/domain mismatches are rejected. Do not enable
`skipSignatureVerification` outside tests.

## Make paid outgoing calls

When `wallets()` is installed, obtain an x402-aware Fetch implementation from
the runtime:

```ts
const paidFetch = await agent.payments?.getFetchWithPayment(agent);
const response = await paidFetch?.(
  'https://seller.example/entrypoints/data/invoke',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { symbol: 'ETH' } }),
  }
);
```

`createRuntimePaymentContext` and `createX402Fetch` are available for lower-level
construction. Never put a server private key in an edge/client bundle.

## Stripe destination mode

Stripe mode resolves a Base crypto deposit address for each challenge. Install
the optional `stripe` peer dependency and provide `stripe` instead of `payTo`:

```ts
payments({
  config: {
    stripe: { secretKey: process.env.STRIPE_SECRET_KEY! },
    facilitatorUrl: 'https://facilitator.example',
    network: 'eip155:8453',
  },
});
```

Direct Stripe utilities are isolated at
`@lucid-agents/payments/providers/stripe`. Stripe is loaded dynamically only
when destination mode is used.

## Analytics and low-level APIs

`runtime.payments.paymentTracker` records incoming and outgoing transactions.
Prefer the bound operations from `@lucid-agents/analytics`:

```ts
const summary = await agent.analytics.getSummary(86_400_000);
const csv = await agent.analytics.exportCSV();
```

Low-level storage, policy, SIWX, and tracker functions remain exported from the
payments package for custom runtimes. Shared configuration and runtime contracts
are defined in `@lucid-agents/types/payments` and
`@lucid-agents/types/siwx`.
