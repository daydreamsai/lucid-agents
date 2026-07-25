# Payment method examples

These examples are the canonical starting point for every payment method in the
Lucid support matrix. They build real Lucid runtimes and expose real HTTP
discovery and challenge responses. External payment providers are injected at
their system boundaries so the default smoke suite never needs a funded wallet,
public RPC, or provider account.

Follow the repository-backed tutorials for
[x402](../../../../lucid-docs/content/docs/examples/x402-payment-methods.mdx)
and [MPP](../../../../lucid-docs/content/docs/examples/mpp-payment-methods.mdx)
for step-by-step configuration and verification.

## Coverage

| Protocol | Method                 | Example                                                               | Operations shown                                               | Executable proof                                             |
| -------- | ---------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| x402     | exact / EVM            | [`x402.ts`](./x402.ts)                                                | invoke, SSE, task admission, outgoing buyer references         | `payment-method-examples.test.ts`                            |
| x402     | exact / Solana         | [`x402.ts`](./x402.ts)                                                | seller offer and discovery; buyers use an external x402 client | `payment-method-examples.test.ts`                            |
| x402     | upto / EVM             | [`x402.ts`](./x402.ts)                                                | invoke ceiling plus handler-reported actual usage              | `smoke.test.ts`                                              |
| x402     | batch-settlement / EVM | [`x402.ts`](./x402.ts)                                                | invoke, SSE, task admission, durable seller mode               | `x402-batch-lifecycle.test.ts`                               |
| x402     | Stripe destination     | [`x402.ts`](./x402.ts)                                                | Base-mainnet dynamic deposit address                           | `payment-method-examples.test.ts`                            |
| x402     | SIWX                   | [`x402.ts`](./x402.ts)                                                | auth-only route and paid-entitlement reuse                     | `payment-method-examples.test.ts`, kitchen-sink protocol E2E |
| x402     | official extensions    | [`x402.ts`](./x402.ts)                                                | Payment Identifier, Bazaar, signed offer/receipt capability    | `smoke.test.ts`                                              |
| MPP      | Tempo charge           | [`mpp.ts`](./mpp.ts)                                                  | invoke, SSE, task admission                                    | real pinned Tempo localnet E2E                               |
| MPP      | Tempo session          | [`mpp.ts`](./mpp.ts)                                                  | one-unit invoke and delivered-unit SSE metering                | real pinned Tempo localnet E2E                               |
| MPP      | Stripe charge          | [`mpp.ts`](./mpp.ts)                                                  | invoke, SSE, task admission                                    | public challenge smoke; settlement needs a Stripe sandbox    |
| MPP      | EVM charge             | [`mpp.ts`](./mpp.ts)                                                  | native Payment Auth and compatible x402 exact retry            | offline signed-credential smoke                              |
| MPP      | custom charge/session  | [`custom-verifier-reference.ts`](../mpp/custom-verifier-reference.ts) | application-defined rail                                       | reusable verifier and HTTP conformance E2E                   |
| MPP      | Lightning              | [`mpp.ts`](./mpp.ts)                                                  | custom descriptor and verifier boundary                        | challenge smoke only; no native settlement claim             |

`coverage.ts` maps these rows one-for-one to
`docs/payment-support-matrix.json`. CI fails if a support row lacks example code
or executable proof.

## x402 seller

`createX402PaymentMethodsExample()` exposes five focused entrypoints:

- `exact-report`: ordered EVM and Solana exact offers, with invoke and SSE
- `metered-report`: EVM `upto`, returning `payment.actualAmount`
- `batch-report`: EVM batch-settlement with invoke and SSE
- `member-profile`: SIWX authentication without payment
- `member-report`: exact payment plus SIWX entitlement reuse

```ts
import { createSQLiteBatchChannelStorage } from '@lucid-agents/payments/storage/batch-sqlite';
import {
  sqlitePaymentStorageFactory,
  sqliteSIWxStorageFactory,
} from '@lucid-agents/payments/storage/sqlite';
import type { TaskStore } from '@lucid-agents/types/a2a';
import { createX402PaymentMethodsExample } from './x402';

declare const durableTaskStore: TaskStore;

const example = await createX402PaymentMethodsExample({
  evm: {
    network: 'eip155:84532',
    payTo: process.env.EVM_RECEIVABLE_ADDRESS as `0x${string}`,
    asset: process.env.EVM_TOKEN_ADDRESS as `0x${string}`,
    exactFacilitatorUrl: process.env.EXACT_FACILITATOR_URL!,
    uptoFacilitatorUrl: process.env.UPTO_FACILITATOR_URL!,
    batchFacilitatorUrl: process.env.BATCH_FACILITATOR_URL!,
  },
  solana: {
    network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
    payTo: process.env.SOLANA_RECEIVABLE_ADDRESS!,
    asset: process.env.SOLANA_TOKEN_ADDRESS!,
    facilitatorUrl: process.env.SOLANA_FACILITATOR_URL!,
  },
  siwxOrigin: 'https://agent.example.com',
  paymentStorage: {
    type: 'sqlite',
    sqlite: { dbPath: '.data/payments.db' },
  },
  paymentStorageFactory: sqlitePaymentStorageFactory,
  siwxStorage: {
    type: 'sqlite',
    sqlite: { dbPath: '.data/siwx.db' },
  },
  siwxStorageFactory: sqliteSIWxStorageFactory,
  taskStore: durableTaskStore,
  batchSettlement: {
    mode: 'production',
    storage: createSQLiteBatchChannelStorage('.data/x402-channels.db'),
  },
  // Inject a public signing capability to add signed offers/receipts.
  offerReceiptIssuer,
});

Bun.serve({ port: 3000, fetch: example.app.fetch });
```

Use `{ batchSettlement: { mode: 'development' } }` only for a bounded local
demo. Production sellers need SQLite or Postgres payment, SIWX, batch-channel,
and task storage. Without `taskStore`, paid invoke and SSE remain available but
paid tasks fail closed with `durable_task_store_required`.

The `upto` handler returns atomic usage separately from the response:

```ts
return {
  output: result,
  payment: {
    actualAmount: String(unitsConsumed * 1_000),
    asset: tokenAddress,
  },
};
```

`actualAmount` may be zero but cannot exceed the authorized ceiling. `upto` is
invoke-only.

## x402 Stripe destination

Stripe destination mode creates a Base crypto deposit address for each
challenge. It is not the MPP Stripe method.

```ts
import { createX402StripeDestinationExample } from './x402';

const example = await createX402StripeDestinationExample({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  facilitatorUrl: process.env.FACILITATOR_URL!,
  network: 'eip155:8453',
});
```

The example intentionally accepts only Base mainnet because that is the current
product contract. The secret stays server-side, and discovery advertises a
dynamic payee rather than a static address.

## MPP charge methods

`createMppChargeMethodsExample()` configures the native Tempo, Stripe, and EVM
charge implementations plus a named custom method and a Lightning custom
descriptor. It creates one route per method and a `charge-any` route that lets a
client select with `Accept-Payment`.

```ts
import type { TaskStore } from '@lucid-agents/types/a2a';
import { createMppChargeMethodsExample } from './mpp';

declare const durableTaskStore: TaskStore;

const example = await createMppChargeMethodsExample({
  tempo: {
    currency: process.env.MPP_TEMPO_CURRENCY!,
    recipient: process.env.MPP_TEMPO_RECIPIENT!,
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY!,
    networkId: process.env.MPP_STRIPE_NETWORK_ID!,
  },
  evm: {
    chainId: 8453,
    currency: process.env.EVM_TOKEN_ADDRESS as `0x${string}`,
    recipient: process.env.EVM_RECEIVABLE_ADDRESS as `0x${string}`,
    decimals: 6,
    authorization: { name: 'USD Coin', version: '2' },
    settlement: {
      type: 'facilitator',
      facilitator: process.env.FACILITATOR_URL!,
    },
  },
  custom: {
    name: 'acme-pay',
    config: { merchantId: process.env.ACME_MERCHANT_ID! },
  },
  lightning: {
    nodeUrl: process.env.LIGHTNING_NODE_URL!,
  },
  verifyCustomCredential: acmeAndLightningVerifier,
  secretKey: process.env.MPP_SECRET_KEY!,
  challengeStore: durableChallengeStore,
  taskStore: durableTaskStore,
});
```

The application verifier is the trust boundary for custom and Lightning
descriptors. It must verify authenticity, challenge binding, amount, currency,
recipient, method, payer, expiry, and settlement. Run the reusable conformance
suite before advertising a provider integration.

Without `taskStore`, MPP invoke and SSE remain available but paid tasks fail
closed. The task store must truthfully declare durable persistence and implement
the fenced lease contract described by `@lucid-agents/a2a`.

## Tempo sessions

Tempo TIP-1034 sessions are configured separately from one-shot Tempo charges:

```ts
import { createSQLiteTempoSessionStore } from '@lucid-agents/mpp/storage/sqlite';
import { createTempoSessionExample } from './mpp';

const example = await createTempoSessionExample({
  session: {
    mode: 'production',
    account: merchantAccount,
    chainId: 4217,
    currency: process.env.MPP_TEMPO_CURRENCY as `0x${string}`,
    recipient: merchantAccount.address,
    decimals: 6,
    amount: '0.001',
    unitType: 'chunk',
    deposit: {
      minimum: '0.001',
      suggested: '0.10',
      maximum: '1.00',
    },
    store: createSQLiteTempoSessionStore('.data/tempo-sessions.db'),
    getClient: ({ chainId }) => getTempoClient(chainId),
  },
  secretKey: process.env.MPP_SECRET_KEY!,
  challengeStore: durableChallengeStore,
});
```

An invoke deducts one unit. SSE deducts delivered units, emits payment receipts,
and may request a refreshed voucher. Tempo sessions do not support Lucid task
admission in this release.

## Buyer references

- x402 paid Fetch, batch continuation, and refund:
  `packages/examples/src/__tests__/x402-batch-lifecycle.test.ts`
- MPP native client construction and Tempo charge/session lifecycle:
  `packages/examples/src/__tests__/tempo-localnet.e2e.ts`
- MPP EVM client credential compatible with x402 exact:
  `packages/examples/src/__tests__/smoke.test.ts`
- outgoing policies and limits:
  `packages/examples/src/payments/policy-agent/index.ts`

## Run the contracts

```bash
bun test packages/examples/src/__tests__/payment-method-examples.test.ts
bun test packages/examples/src/__tests__/smoke.test.ts
bun test packages/examples/src/__tests__/x402-batch-lifecycle.test.ts
bun test packages/examples/src/__tests__/custom-mpp-conformance.e2e.test.ts

# Real digest-pinned Tempo development node
bun run scripts/tempo-localnet.ts -- \
  bun test packages/examples/src/__tests__/tempo-localnet.e2e.ts
```

MPP Stripe settlement still needs an isolated Stripe Business Network sandbox.
Lightning remains a custom descriptor and needs a separately scoped regtest
integration before anyone can claim native interoperability.
