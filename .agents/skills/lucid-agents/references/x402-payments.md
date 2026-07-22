# x402 payments, SIWX, and analytics

Install payments as an extension and obtain configuration through the package's supported helpers for the installed version:

```ts
import { payments, paymentsFromEnv } from '@lucid-agents/payments';

const config = paymentsFromEnv();
const builder = createAgent(meta).use(http());
if (config) builder.use(payments({ config }));
```

Verify exact extension ordering and optional-config behavior from local declarations. Prices on entrypoints are USD decimal strings in current releases. Never assume an integer is minor units without checking the installed contract.

When x402 and MPP are both installed, set the entrypoint payment protocol explicitly when required by the installed API. Do not let route adapters choose a protocol.

The shared HTTP authorization transaction owns SIWX, x402 or MPP challenge handling, verified-sender policies, reservations, settlement, and release on failure. Do not verify or settle twice in a handler. Use the verified identity and payment context exposed by the runtime.

Production requirements:

- Keep wallet keys, facilitator credentials, and webhook secrets server-side.
- Select the intended EVM or Solana network explicitly.
- Use a durable reservation/payment store when duplicate settlement matters.
- Make settlement callbacks idempotent.
- Log stable identifiers and redacted failures, never raw secrets or signed credentials.
- Use `@lucid-agents/analytics` only through its payments-bound runtime; it does not replace authoritative settlement records.

Identity registration is EVM-only, while payment receiving may use supported EVM or Solana networks. Do not couple those selections.
