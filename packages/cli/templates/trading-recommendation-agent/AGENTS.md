# Trading recommendation service — coding-agent guide

This template is a buyer-style example. It calls another Lucid service through
Agent Card discovery and the Lucid HTTP client, then derives a mock trading
signal.

The current generator still has pre-v3 composition/dependency/task-client
wiring for this template. Treat this file as the target migration contract; do
not report the generated project complete until it is added to the
packed-workspace generated test and passes install, type-check, build, boot,
policy, paid-invoke, and task-recovery verification.

## Compatibility boundary

The relevant package is named `@lucid-agents/a2a`, but the current cards,
`/entrypoints`, `/tasks`, states, and access tokens are Lucid contracts. They
are not the official A2A v1 binding or TCK-conformant operations.

## Build the paid Fetch once

The agent wallet supplies signing authority; policy must supply spending
authority:

```ts
const paymentContext = await createRuntimePaymentContext({
  runtime: agent,
  network: 'eip155:84532',
});

const paidFetch = paymentContext.fetchWithPayment;
if (!paidFetch) throw new Error('Compatible buyer wallet is required');
```

Do not pass private keys, payment credentials, or raw challenges through the
model/handler input. Before autonomous use, put recipient, endpoint, network,
asset, per-request, and durable total limits under the x402 wrapper.

## Direct invoke profile

```ts
const result = await agent.a2a.client.fetchAndInvoke(
  DATA_AGENT_URL,
  'getPrice',
  { symbol: 'BTC/USD' },
  paidFetch
);
```

Generate one business `Idempotency-Key` outside any retry/model loop when using
the lower-level invoke options. Validate the returned output before deriving a
signal.

## Lucid task profile

```ts
const card = await agent.a2a.fetchCard(DATA_AGENT_URL);
const access = await agent.a2a.client.sendMessage(
  card,
  'getMarketData',
  { symbol: 'BTC/USD', timeframe: '1h' },
  paidFetch
);

const task = await agent.a2a.client.getTask(card, access, paidFetch);
```

Persist the complete `{ taskId, accessToken }` capability securely for polling.
Never log or put the token in a URL/browser store. A slow task is not a reason
to create another paid task.

Use `fetchCardWithEntrypoints()` only when the Lucid-specific entrypoint record
is required. Discovery metadata is not wallet approval; validate the final URL,
payee, network, and amount independently.

## Wallet configuration

The environment-backed local wallet requires:

```dotenv
AGENT_WALLET_TYPE=local
AGENT_WALLET_PRIVATE_KEY=0xSERVER_ONLY_BUYER_KEY
PAYMENTS_NETWORK=eip155:84532
DATA_AGENT_URL=https://ALLOWLISTED_SELLER
```

Use a dedicated low-balance wallet. The buyer and seller must support the same
x402 scheme/network/asset, but should not share private keys.

## Completion evidence

Test wrong recipient/network, over-budget price, malformed card/output, unpaid
challenge, successful testnet payment, same-key retry, task timeout/cancel, and
timeout after signing. Reconcile payment receipt and seller fulfillment before
allowing another ambiguous attempt.

The strategies are demonstration logic, not financial advice. Bound input,
price history size, calls, duration, parallelism, and spend before using real
data or funds.
