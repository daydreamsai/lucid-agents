# @lucid-agents/analytics

Payment summaries, transaction views, and CSV/JSON export bound to a Lucid
payments runtime.

## Extension API

```ts
import { analytics } from '@lucid-agents/analytics';
import { createAgent } from '@lucid-agents/core';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';

const agent = await createAgent({ name: 'merchant', version: '1.0.0' })
  .use(payments({ config: paymentsFromEnv() }))
  .use(analytics())
  .build();

const summary = await agent.analytics.getSummary(86_400_000);
const transactions = await agent.analytics.getTransactions();
const data = await agent.analytics.getData();
const csv = await agent.analytics.exportCSV();
const json = await agent.analytics.exportJSON();
```

`windowMs` is optional on every operation. When present, only records inside the
trailing time window are included.

The extension requires `payments()` at both the type and runtime levels. It
captures the owning payments tracker during build and returns bound operations;
consumers do not pass a tracker through a second wrapper. Build fails if payments
is disabled or has no tracker.

## Standalone functions

Low-level functions remain available for tools that intentionally manage a
tracker themselves:

```ts
import {
  getSummary,
  getAllTransactions,
  getAnalyticsData,
  exportToCSV,
  exportToJSON,
} from '@lucid-agents/analytics';

const summary = await getSummary(paymentTracker, 86_400_000);
```

Prefer the extension API inside an agent runtime. Analytics contracts are
defined in `@lucid-agents/types/analytics`; payment persistence and isolation are
owned by `@lucid-agents/payments`.
