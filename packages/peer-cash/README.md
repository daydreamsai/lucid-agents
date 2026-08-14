# @lucid-agents/peer-cash

Custody-separated Peer Cash off-ramp support for Lucid agents. The extension
adds a `runtime.peerCash` slice for converting Base USDC to fiat through Peer
payment-platform orders.

The package does not accept private keys, sign transactions, or broadcast
them. It returns JSON-safe unsigned Base transaction plans. The host wallet
must inspect, sign, and submit every transaction in order.

## Install

```bash
bun add @lucid-agents/peer-cash @lucid-agents/core
```

## Add the runtime

```ts
import { createAgent } from '@lucid-agents/core';
import { peerCash } from '@lucid-agents/peer-cash';

const runtime = await createAgent({
  name: 'treasury-agent',
  version: '1.0.0',
})
  .use(
    peerCash({
      environment: 'production',
      referralCode: process.env.PEER_REFERRAL_CODE,
    })
  )
  .build();
```

No API key is required for the Base USDC path.

## Discover and estimate

```ts
const capabilities = runtime.peerCash.capabilities();
const demand = await runtime.peerCash.fillStats();

const estimate = await runtime.peerCash.estimate({
  amountUsdc: '25',
  currency: 'GBP',
  platform: 'wise',
});
```

Estimates use the live oracle market rate. They are planning estimates, not
locked quotes. Call `fillStats()` before choosing a corridor; it returns
30-day fill counts and median time to first fill.

## Prepare, sign, and finalize a cash-out

```ts
const prepared = await runtime.peerCash.prepareCashout({
  amountUsdc: '25',
  platform: 'revolut',
  currency: 'GBP',
  payee: { offchainId: 'your-revtag' },
});

// Host-owned wallet boundary. Inspect, sign, submit, and confirm each
// transaction in prepared.txs in order.
const createDepositReceipt = await submitWithHostWallet(prepared.txs);

const cashout = runtime.peerCash.finalizeCashout(createDepositReceipt);
console.log(cashout.depositId);

if (prepared.accessPolicyRequired) {
  const policyTx = runtime.peerCash.prepareAccessPolicy(cashout.depositId);
  await submitWithHostWallet([policyTx]);
}
```

`submitWithHostWallet` is deliberately application-owned. Use the Lucid wallet
runtime, an account-abstraction wallet, an external signer, or another policy
layer that can submit Base transactions.

Wise and PayPal require a verified identity for a new payee registration. Pass
the structured `CashPayeeInput` returned by the host's identity-attestation
flow; an already registered handle can still be reused as a string. The Peer
Cash SDK validates this before any funds move on-chain.

## Resume and unwind

The composite `depositId` is the durable resume key:

```ts
const order = await runtime.peerCash.order(depositId);
const active = await runtime.peerCash.orders(ownerAddress, {
  inFlight: true,
  limit: 100,
});

const withdrawal = await runtime.peerCash.prepareWithdrawal(depositId);
await submitWithHostWallet(withdrawal.txs);
```

Pass `{ amountUsdc: '5' }` to prepare a partial withdrawal. To add funds while
keeping the same payout details:

```ts
const topUp = await runtime.peerCash.prepareTopUp(depositId, '10');
await submitWithHostWallet(topUp.txs);
```

## Runtime surface

| Method                                  | Effect                                                          |
| --------------------------------------- | --------------------------------------------------------------- |
| `capabilities()`                        | List supported platforms, currencies, bounds, and pricing model |
| `fillStats()`                           | Read 30-day corridor demand and fill-time evidence              |
| `estimate(input)`                       | Read a market-rate fiat estimate                                |
| `prepareCashout(input)`                 | Register payout data and return unsigned deposit transactions   |
| `finalizeCashout(receipt)`              | Resolve a confirmed deposit receipt to a resumable order        |
| `prepareAccessPolicy(depositId)`        | Return the unsigned restricted-platform policy transaction      |
| `order(depositId)`                      | Read current order state and next actions                       |
| `orders(owner, options)`                | List orders for one wallet                                      |
| `prepareWithdrawal(depositId, options)` | Return unsigned partial or full unwind transactions             |
| `prepareTopUp(depositId, amountUsdc)`   | Return unsigned top-up transactions                             |

All returned values are JSON serializable. Human USDC inputs accept up to six
decimal places; transaction values and protocol amounts are returned as
decimal strings.
