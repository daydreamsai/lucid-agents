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
`finalize()` settles after a successful invoke or successful fixed-price
stream/task admission. Tempo session streams instead reserve their verified
maximum, then finalize exactly once with delivered atomic usage when the stream
completes, fails, or disconnects. Immediately before an irreversible
settlement, policy accounting is moved into a durable, non-expiring staged
batch. Invalid input, failed invoke output/handlers, failed admission, and
failed settlement release provisional or staged capacity; if final accounting
fails after settlement, the staged batch remains counted until reconciliation
instead of expiring open. A later asynchronous fixed-price stream/task failure
does not rewind an already accepted HTTP operation. SIWX entitlements are
checked before either x402 or MPP challenges, so both rails support the same
paid-entitlement reuse path.

## Configuration

```ts
payments({
  config: {
    payTo: '0xabc0000000000000000000000000000000000000',
    facilitatorUrl: 'https://facilitator.example',
    facilitatorAuth: process.env.PAYMENTS_FACILITATOR_AUTH,
    network: 'eip155:84532',
    storage: { type: 'in-memory' },
  },
});
```

Supported aliases normalize to CAIP-2 identifiers:

| Alias           | Canonical network                         |
| --------------- | ----------------------------------------- |
| `base`          | `eip155:8453`                             |
| `base-sepolia`  | `eip155:84532`                            |
| `ethereum`      | `eip155:1`                                |
| `sepolia`       | `eip155:11155111`                         |
| `solana`        | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| `solana-devnet` | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` |

`paymentsFromEnv(overrides?, env?)` reads:

- `PAYMENTS_RECEIVABLE_ADDRESS`
- `FACILITATOR_URL` or `PAYMENTS_FACILITATOR_URL`
- `NETWORK` or `PAYMENTS_NETWORK`
- `FACILITATOR_AUTH` or `PAYMENTS_FACILITATOR_AUTH`
- `PAYMENTS_DESTINATION=stripe` and `STRIPE_SECRET_KEY` for Stripe mode
- `SIWX_PUBLIC_ORIGIN` or `PAYMENTS_PUBLIC_ORIGIN` to enable SIWX with a
  browser-visible origin

Pass an explicit `env` record in runtimes that do not expose `process.env`.
Configuration is validated when a priced or SIWX entrypoint activates payments.

### Migrating from the single-offer x402 configuration

The legacy `price`, `network`, `payTo`, and `facilitatorUrl` fields remain
compatibility sugar for one `exact` offer. New services can declare every
accepted commercial path on the canonical entrypoint:

```ts
addEntrypoint({
  key: 'quote',
  paymentProtocol: 'x402',
  x402: {
    offers: [
      {
        scheme: 'exact',
        network: 'eip155:84532',
        facilitatorUrl: 'https://evm-facilitator.example',
        price: '0.01',
      },
      {
        scheme: 'exact',
        network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
        facilitatorUrl: 'https://svm-facilitator.example',
        price: '0.01',
      },
    ],
  },
  handler,
});
```

Offer order is buyer preference order. Each declared scheme/network pair must
be supported by its assigned facilitator; Lucid reports unsupported offers
instead of silently falling back to another network or facilitator. `exact`
supports the released EVM and SVM implementations. `upto` and
`batch-settlement` are EVM-only in this release, and `upto` is invoke-only.

When migrating SIWX, set the public `siwx.origin` explicitly and update clients
to the official `sign-in-with-x` declaration and `SIGN-IN-WITH-X` proof header.
When enabling Payment Identifier, also configure HTTP invoke idempotency; Lucid
will reject an identified payment if the transport cannot acquire a completed
response claim before admission.

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
      origin: 'https://agent.example.com',
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

## Batch settlement channels

An entrypoint can advertise an EVM batch-settlement offer alongside existing
exact offers. Offer order is preserved:

```ts
import { createSQLiteBatchChannelStorage } from '@lucid-agents/payments/storage/batch-sqlite';

payments({
  config: {
    ...config,
    offers: [
      { scheme: 'exact', network: 'eip155:84532', price: '1000' },
      {
        scheme: 'batch-settlement',
        network: 'eip155:84532',
        maximum: '1000',
      },
    ],
  },
  batchSettlement: {
    mode: 'production',
    storage: createSQLiteBatchChannelStorage('.data/x402-channels.db'),
  },
});
```

Production mode requires a durable store. Use
`{ batchSettlement: { mode: 'development' } }` for the bounded, process-local
development default. The runtime closes the selected store once when the agent
is disposed. SQLite and Postgres adapters serialize the upstream channel update
callback across processes, preventing two replicas from consuming the same
cumulative voucher.

Buyers continue a channel across restarts by injecting client channel storage:

```ts
const payment = await createRuntimePaymentContext({
  privateKey,
  network: 'base-sepolia',
  batchSettlement: { storage: durableClientChannelStorage },
});

await payment.fetchWithPayment?.(sellerUrl);
await payment.refundBatchChannel?.(sellerUrl);
```

The paid Fetch path handles initial deposits, cumulative vouchers, corrective
402 recovery, and settlement-response persistence through the x402 2.19 client.
Successful seller responses include stable Lucid channel and voucher-settlement
IDs in addition to the standard `PAYMENT-RESPONSE` receipt.

## Reconciliation and discovery extensions

Enable the official x402 Payment Identifier, Bazaar, and signed offer/receipt
extensions at the resource server:

```ts
payments({
  config,
  reconciliation: {
    paymentIdentifier: { required: true },
    bazaar: { enabled: true },
    offerReceipt: {
      issuer,
      includeTxHash: false,
      offerValiditySeconds: 300,
    },
  },
});
```

`issuer` is an injected `OfferReceiptIssuer` signing capability. Lucid does not
accept or expose server private-key material, and discovery projections contain
only the public offer/receipt declaration.

When Payment Identifier is enabled, a paid invoke request must copy the
official x402 identifier into `Idempotency-Key`. Lucid rejects malformed,
missing, or mismatched identifiers before facilitator verification, policy
admission, application execution, or settlement. A verified identifier is
exposed as `authorization.reconciliation.paymentIdentifier`; it is correlation
metadata only and never replaces the cryptographically verified payer subject.
The extension is not advertised or enforced for stream or task operations,
whose transports do not own a completed-response idempotency claim.

The HTTP transport owns durable replay semantics. It must atomically claim the
verified identifier before calling `admit()` or the application handler, store
the successful settled response, and return that response for later replays
without admitting, executing, or settling again.

`runtime.payments.projectPayment(entrypoint, kind)` exposes the canonical offers
and official extension declarations without binding them to an HTTP framework.
`runtime.payments.openApiComponents` exposes the shared reconciliation schemas
for transport-owned OpenAPI documents. Bazaar input and output metadata is
derived from the canonical entrypoint Zod schemas and is validated with the
official x402 extension parser.

## Usage-metered upto payments

The EVM `upto` scheme authorizes a ceiling before an invoke handler runs and
settles the actual amount returned by the handler:

```ts
addEntrypoint({
  key: 'metered-search',
  paymentProtocol: 'x402',
  x402: {
    offers: [
      {
        scheme: 'upto',
        network: 'eip155:84532',
        maximum: {
          amount: '10000',
          asset: '0x0000000000000000000000000000000000000010',
        },
      },
    ],
  },
  handler: async ({ input }) => {
    const result = await search(input);
    return {
      output: result.output,
      payment: {
        // Atomic token units, independent of the serialized response body.
        actualAmount: String(result.unitsConsumed * 100),
      },
    };
  },
});
```

`actualAmount` must be a non-negative integer no greater than the accepted
ceiling. Zero is valid. Incoming total policies reserve the ceiling before
execution, then atomically replace it with the actual amount immediately before
settlement, releasing unused capacity without a race window. Missing, malformed,
asset-mismatched, or over-ceiling results fail without settlement.

Upto is invoke-only. Declaring it on a streaming entrypoint, or attempting to
use it for task admission, returns an explicit capability error. Exact, upto,
and batch-settlement offers may coexist; their declaration order remains the
buyer-selection order.

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

For a verified Tempo session stream, policy admission reserves the atomic
maximum deposit before application delivery. HTTP supplies the verified channel
reference and `deliveredUnits * unitAmount` out of band during finalization.
The payments runtime rejects missing, malformed, channel-mismatched, or
over-ceiling session accounting and atomically replaces total-limit
reservations with actual delivered usage.

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
          origin: 'https://members.example.com',
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
and resource/domain mismatches are rejected. `origin` is required whenever
SIWX is enabled. It must be the public HTTPS origin clients see; HTTP is accepted
only for an explicit `localhost`, `127.0.0.1`, or `[::1]` development origin.
Lucid rebases request paths onto this configured origin and never trusts
`Host`, `Forwarded`, or `X-Forwarded-Host` for signing.

Challenges and proofs use the official x402 SIWX extension:
`PaymentRequired.extensions["sign-in-with-x"]` and the
`SIGN-IN-WITH-X` request header. Existing Lucid low-level helper names remain
available, but legacy `X-SIWX-EXTENSION`, `X-SIGN-IN-WITH-X`,
`error.siwx`, and `extensions.siwx` wire fields are neither emitted nor
accepted.

EOA verification works without an RPC. Set `verify.evmRpcUrl` to enable the
official EVM verifier path for EIP-1271 and EIP-6492 smart wallets. Do not
enable `skipSignatureVerification` outside tests.

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
