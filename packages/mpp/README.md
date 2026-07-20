# @lucid-agents/mpp

Machine Payments Protocol (MPP) authorization for Lucid Agents. The extension
uses the Payment-Auth wire format, delegates Tempo and Stripe
verification to mppx, and routes every adapter and Lucid task through the same
authorization gate.

MPP is currently the individual Internet-Draft
`draft-ryan-httpauth-payment-01`, not an IETF standard. This package uses
`mppx` 0.1 and implements a Lucid HTTP subset; it does not provide every MPP
transport, discovery mechanism, rail, subscription, or session feature.

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

`tempo.server()` and `stripe.server()` are materialized as native mppx server
methods. They validate the echoed HMAC challenge, credential schema, payment,
and settlement before Lucid runs the entrypoint. Stripe also requires its
Business Network profile:

```ts
stripe.server({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  networkId: process.env.MPP_STRIPE_NETWORK_ID!,
  currency: 'usd',
});
```

Set a stable, high-entropy `MPP_SECRET_KEY` in production. If omitted, Lucid
generates a new key for each process. Lucid's outstanding-challenge and replay
registry is also process-local, so paid retries require sticky routing and do
not survive a restart even when the key is configured. Challenge IDs are
additionally bounded, target-bound, short-lived, and atomically consumed before
verification to prevent concurrent replay.

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

Challenges are standard responses:

```text
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment id="...", realm="...", method="tempo", intent="charge", request="...", expires="..."
```

Clients retry with a standard credential:

```text
Authorization: Payment <base64url-credential>
```

Malformed, unknown, expired, wrong-target, replayed, and verifier-rejected
credentials fail closed. Successful responses carry `Payment-Receipt`.
`decodeMppCredential()` is intentionally decode-only and is never sufficient
for authorization.

## Entrypoint overrides

```ts
.addEntrypoint({
  key: 'session',
  price: { invoke: '0.001', stream: '0.0001' },
  paymentProtocol: 'mpp',
  metadata: {
    mpp: {
      intent: 'session',
      methods: ['tempo'],
      description: 'Metered research session',
    },
  },
  handler: async () => ({ output: {} }),
})
```

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
