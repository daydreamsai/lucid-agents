# @lucid-agents/mpp

Machine Payments Protocol (MPP) authorization for Lucid Agents. The extension
uses the Payment-Auth wire format, delegates Tempo, Stripe, and EVM
verification to mppx, and routes every adapter and Lucid task through the same
authorization gate. Native EVM charges also accept compatible x402 v2 exact
credentials without installing or configuring a second Lucid x402 seller.

MPP is compatible with the July `draft-httpauth-payment-00` Internet-Draft, not
an IETF standard. This package uses `mppx` 0.8.13 and implements a Lucid HTTP
subset; it does not provide every MPP transport, discovery mechanism, rail,
subscription, or session feature.

## Built-in payment methods

```ts
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { mpp, tempo } from '@lucid-agents/mpp';

const agent = await createAgent({ name: 'merchant', version: '1.0.0' })
  .use(
    mpp({
      config: {
        methods: [
          tempo.server({
            currency: '0x20c0000000000000000000000000000000000000',
            recipient: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
          }),
        ],
        secretKey: process.env.MPP_SECRET_KEY,
      },
    })
  )
  .use(http())
  .addEntrypoint({
    key: 'report',
    price: '0.05',
    paymentProtocol: 'mpp',
    handler: async () => ({ output: { report: '...' } }),
  })
  .build();
```

`tempo.server()`, `stripe.server()`, and `evm.server()` are materialized as
native mppx charge methods. They validate the echoed HMAC challenge, credential
schema, payment, and settlement before Lucid runs the entrypoint. Stripe also
requires its Business Network profile:

```ts
stripe.server({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  networkId: process.env.MPP_STRIPE_NETWORK_ID!,
  currency: 'usd',
});
```

Tempo TIP-1034 sessions use the separate, explicit `tempo.session()`
descriptor. The server account must be a signing viem `Account`; an address by
itself is not sufficient for close and scheduled-settlement transactions.

```ts
import { tempo } from '@lucid-agents/mpp';
import { createSQLiteTempoSessionStore } from '@lucid-agents/mpp/storage/sqlite';

tempo.session({
  mode: 'production',
  account: merchantAccount,
  chainId: 4217,
  currency: '0x20c0000000000000000000000000000000000000',
  recipient: merchantAccount.address,
  decimals: 6,
  amount: '0.001',
  unitType: 'response',
  deposit: {
    minimum: '0.001',
    suggested: '0.10',
    maximum: '1.00',
  },
  store: createSQLiteTempoSessionStore('.data/tempo-sessions.db'),
  bootstrap: true,
  resolveChannelId: async ({ source, paymentRequest }) =>
    source ? lookupChannel(source, paymentRequest) : undefined,
  settlementSchedule: { units: 100, intervalMs: 60_000 },
  onSettlement: event => recordSettlement(event),
  getClient: ({ chainId }) => getTempoClient(chainId),
});
```

The minimum, suggested, and maximum deposits are enforced in the configured
currency precision. Development may omit `store` to use bounded process-local
memory; production rejects process-local storage. The SQLite and Postgres
exports implement atomic updates so vouchers, top-ups, close/finalization,
restart recovery, and concurrent deductions share one durable channel state.

For ordinary invokes, native verification deducts exactly one configured
`amount` before the handler. Open and voucher credentials attached to billable
requests can reach the handler; top-up, close, and non-billable management
requests return their protocol response without invoking application code.
Streaming uses the same channel and emits standard receipt and voucher-needed
events while charging delivered units. The configured maximum deposit bounds
the accounting reservation; final accounting is reconciled to delivered
units.

An EVM descriptor names the EIP-3009 chain, token, recipient, precision, and
exactly one settlement strategy:

```ts
import { evm, mpp } from '@lucid-agents/mpp';

mpp({
  config: {
    methods: [
      evm.server({
        chainId: 8453,
        currency: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        recipient: '0xYourMerchantAddress',
        decimals: 6,
        authorization: { name: 'USD Coin', version: '2' },
        settlement: {
          type: 'facilitator',
          facilitator: 'https://facilitator.example',
        },
      }),
    ],
    secretKey: process.env.MPP_SECRET_KEY,
  },
});
```

For application-owned settlement, use
`settlement: { type: 'custom', settle: async context => ... }`. The callback
runs only after the EIP-3009 signature, route, body, amount, asset, recipient,
and payer have been verified. It must return a durable settlement `reference`.
The EVM rail accepts both `Authorization: Payment ...` and x402 v2
`PAYMENT-SIGNATURE` retries. Both paths share the same atomic challenge store,
settlement strategy, verified payer/network metadata, and selected offer.
Successful x402 retries add both `Payment-Receipt` and `PAYMENT-RESPONSE`.

Set a stable, high-entropy `MPP_SECRET_KEY` in production. If omitted, Lucid
generates a new key for each process. The default outstanding-challenge and
replay registry is process-local. Production services can inject a shared
`challengeStore`, including the package's SQLite and Postgres adapters, so
challenge leases and idempotent receipt recovery survive multiple instances or
restarts. Challenge IDs are bounded, operation/body-bound, short-lived, and
atomically claimed before verification to prevent concurrent replay. Lucid
renews the active lease while native or custom verification is running and
fences the result before consuming it. Custom `MppChallengeStore`
implementations must make `renew()` atomic and return `lost` unless the same
unexpired lease still owns the challenge.

## Custom payment methods

Custom and Lightning descriptors require an application verifier:

```ts
import { custom, mpp } from '@lucid-agents/mpp';

mpp({
  config: {
    methods: [custom.server('acme-pay', { merchantId: 'merchant-42' })],
    currency: 'usd',
    async verifyCredential({ credential, requirement }) {
      const result = await verifyWithAcme({
        challenge: credential.challenge,
        payload: credential.payload,
        amount: requirement.amount,
      });
      return result.settled
        ? {
            valid: true,
            receipt: result.receipt,
            payer: result.payer,
            network: result.network,
          }
        : { valid: false, reason: 'Payment was not settled' };
    },
  },
});
```

The custom verifier is the trust boundary. It must validate the signature,
amount, currency, recipient, method, settlement, and asserted payer. A custom
method without a verifier always fails closed.

Verification occurs before target-side idempotency replay. A verifier that
performs an externally visible settlement must also deduplicate it with the
request's `Idempotency-Key`. Policy reservations and Lucid accounting happen
only after the request wins a new target-side claim.

## Wire and replay contract

Challenges are standard responses. A priced operation configured with multiple
methods emits one challenge per compatible method in stable server order:

```text
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="...", realm="...", method="tempo", intent="charge", request="...", expires="..."
WWW-Authenticate: Payment id="...", realm="...", method="stripe", intent="charge", request="...", expires="..."
WWW-Authenticate: Payment id="...", realm="...", method="evm", intent="charge", request="...", expires="..."
```

Clients can filter and rank those offers with `Accept-Payment`, including
wildcards and HTTP q-values:

```text
Accept-Payment: evm/charge, stripe/charge;q=0.8, tempo/charge;q=0
```

Absent or malformed preferences preserve server order. If a syntactically
valid header matches no configured method, Lucid deterministically ignores it
and emits the normal server offers. A retry is always dispatched by the
method/intent in its signed challenge; a changed `Accept-Payment` header cannot
downgrade it to another verifier.

Clients retry with a standard credential:

```text
Authorization: Payment <base64url-credential>
```

Malformed, unknown, expired, wrong-target, replayed, and verifier-rejected
credentials fail closed. Successful responses carry `Payment-Receipt`.
`decodeMppCredential()` is intentionally decode-only and is never sufficient
for authorization.

## OpenAPI discovery

The HTTP extension serves base-path-aware OpenAPI 3.1 discovery at
`/openapi.json`. Paid invoke and stream operations include ordered
`x-payment-info.offers` derived from the same resolver used for live
challenges. The document describes `Accept-Payment`, Payment credentials,
`WWW-Authenticate`, `Payment-Receipt`, and RFC 9457 Problem Details without
serializing recipients, API keys, verifier secrets, or other method config.
When an EVM offer is present, discovery also describes the x402
`PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, and `PAYMENT-RESPONSE` headers.

Protocol-neutral HTTP integrations can compose the same projection directly:

```ts
const operationPayment = agent.mpp.projectPayment(entrypoint, 'invoke');
const paymentComponents = agent.mpp.openApiComponents();

const document = agent.mpp.projectOpenApi({
  title: 'Merchant agent',
  version: '1.0.0',
  basePath: '/api/agent',
  entrypoints: agent.entrypoints.snapshot(),
});
```

`projectPayment()` is the composable per-operation API. `projectOpenApi()` is a
standalone document projection for transports that do not already own an
OpenAPI builder.

## Entrypoint overrides

```ts
.addEntrypoint({
  key: 'session',
  price: { invoke: '0.001', stream: '0.0001' },
  paymentProtocol: 'mpp',
  metadata: {
    mpp: {
      intent: 'session',
      methods: ['acme-session'],
      description: 'Metered research session',
    },
  },
  handler: async () => ({ output: {} }),
})
```

The `acme-session` descriptor in this example must be configured through
`custom.server()` with an application verifier as described above.

If x402 and MPP are both installed, every priced entrypoint must select
`paymentProtocol: 'x402' | 'mpp'`.

## Outbound calls

Pass native client intents from `mppx/client`:

```ts
import { tempo } from 'mppx/client';

const paidFetch = await agent.mpp.getMppFetch({
  methods: [tempo({ account })],
});

const response = await paidFetch?.('https://merchant.example/report');
```

Lucid creates mppx with `polyfill: false`, so `globalThis.fetch` is never
replaced. A custom Fetch implementation can be supplied as `fetch`.

## Environment helper

`mppFromEnv(overrides)` reads `MPP_METHOD`, `MPP_CURRENCY`,
`MPP_DEFAULT_INTENT`, `MPP_CHALLENGE_EXPIRY`, `MPP_SECRET_KEY`, `MPP_REALM`,
Tempo recipient/currency settings, and Stripe secret/network settings. Any
explicit custom verifier is preserved.

MPP contracts are defined only in `@lucid-agents/types/mpp`; this package does
not duplicate or re-export them.

## Migrating to this release

`MppRuntime` requires `hasCredential(request)`, `projectPayment()`,
`openApiComponents()`, and `projectOpenApi()`. Custom runtime
implementations must perform only canonical credential detection there; the
method must not verify or settle a payment. The built-in `mpp()` extension uses
the same decoder as authorization, including comma-separated `Authorization`
schemes.

A successful custom `verifyCredential` result must now include a non-empty
serialized `receipt`:

```ts
return settled
  ? { valid: true, receipt: settlement.receipt }
  : { valid: false, reason: 'Payment was not settled' };
```

Custom challenge stores must also implement atomic renewable verification
leases through `MppChallengeStore.renew()`. The claim and renewal results
include `renewAfterMs`, which lets the runtime refresh leases before another
worker may reclaim them.

The receipt must already be an exact, legal HTTP header value no larger than
8 KiB: leading or trailing whitespace, control characters, and oversized
values are rejected. Once a verifier claims success, an invalid receipt
consumes that credential and returns a service error rather than retrying the
verifier, because settlement may already be irreversible.

This is a breaking contract change. Lucid fails closed when a verifier claims
success without a usable receipt because task admission cannot report a
coherent post-settlement outcome otherwise.
