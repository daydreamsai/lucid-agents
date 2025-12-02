---
'@lucid-agents/payments': patch
'@lucid-agents/types': patch
'@lucid-agents/core': patch
---

Add comprehensive payment policy enforcement system for controlling agent payments. The system supports multiple named policy groups, each with:

- **Spending Limits**: Per-request and total spending limits (stateless and stateful, in-memory tracking)
  - Global, per-target (agent URL/domain), or per-endpoint scope
  - Time-windowed total spending limits
- **Recipient Controls**: Whitelist/blacklist of recipient addresses or domains
- **Rate Limiting**: Limit number of payments per time window (scoped per policy group)

All policies are automatically enforced when using `createRuntimePaymentContext` for payment-enabled fetch. Policies are evaluated before payment is made - the first violation blocks the payment.

**Usage Example:**

```ts
import { payments } from '@lucid-agents/payments';
import type { PaymentPolicyGroup } from '@lucid-agents/types/payments';

const policyGroups: PaymentPolicyGroup[] = [
  {
    name: 'Daily Spending Limit',
    spendingLimits: {
      global: {
        maxPaymentUsd: 10.0,
        maxTotalUsd: 100.0,
        windowMs: 24 * 60 * 60 * 1000,
      },
    },
    rateLimits: {
      maxPayments: 100,
      windowMs: 60 * 60 * 1000,
    },
  },
];

const agent = await createAgent({ ... })
  .use(payments({
    config: {
      ...paymentsFromEnv(),
      policyGroups,
    },
  }))
  .build();
```

**Backward Compatible**: Policies are optional - existing agents without policies will continue to work unchanged. See `packages/core/examples/policy-agent.ts` for a complete example.

