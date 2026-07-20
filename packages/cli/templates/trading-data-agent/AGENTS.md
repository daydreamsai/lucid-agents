# Trading data service — coding-agent guide

This template is a merchant-style example that exposes mock market data as
priced Lucid entrypoints.

The current generator still has pre-v3 composition/dependency wiring for this
template. Treat this file as the target migration contract; do not report the
generated project complete until it is added to the packed-workspace generated
test and passes install, type-check, build, boot, challenge, and paid-call
verification.

## Compatibility boundary

The service publishes an Agent Card and uses Lucid's HTTP entrypoint profile.
It does not implement the official A2A v1 transport/task model and must not be
described as A2A-conformant. AP2 configuration, when present, publishes role
metadata only; it does not execute AP2 mandates or checkout.

## Preserve these boundaries

- The completed Lucid runtime owns entrypoints and payment authorization.
- The Hono/Express adapter only binds canonical routes.
- Prices are USD decimal strings: `'0.005'` means half a cent, not 5,000 base
  units.
- `PAYMENTS_RECEIVABLE_ADDRESS` is the seller destination; the runtime does not
  need its private key merely to receive.
- Facilitator credentials and provider keys remain server-side.

## Add or change an offering

Define a stable key, bounded input/output schemas, an explicit price, and a
handler whose result satisfies the output schema:

```ts
agent.entrypoints.add({
  key: 'getHistoricalData',
  description: 'Return bounded historical candles',
  price: '0.01',
  paymentProtocol: 'x402',
  input: z.object({
    symbol: z.string().min(1).max(32),
    points: z.number().int().min(1).max(100),
  }),
  output: candleOutput,
  handler: async ({ input, signal }) => ({
    output: await loadCandles(input, { signal }),
  }),
});
```

Do not add a second framework payment middleware or unprotected route to the
same handler.

## Payment configuration

Use `paymentsFromEnv()` through the existing payments extension. Preferred
variables are:

```dotenv
PAYMENTS_FACILITATOR_URL=https://YOUR_TESTNET_FACILITATOR
PAYMENTS_FACILITATOR_AUTH=SERVER_ONLY_TOKEN
PAYMENTS_NETWORK=eip155:84532
PAYMENTS_RECEIVABLE_ADDRESS=0xYOUR_EVM_ADDRESS
```

The wizard accepts aliases, but new checked-in docs/config should use canonical
CAIP-2 identifiers. A template default is not a production provider
recommendation.

## Completion evidence

Run the generated type-check/build and test:

1. invalid input returns `400 invalid_input`;
2. an unpaid priced call returns x402 `402` without executing fulfillment;
3. a funded testnet call returns schema-valid output plus
   `PAYMENT-RESPONSE`;
4. a same-key retry does not duplicate fulfillment; and
5. Agent Card prices/networks match the entrypoint definitions.

Before production, replace mock data, add incoming limits/rate controls, use
durable payment/idempotency state, bound provider calls, and publish the
failure/refund policy.
