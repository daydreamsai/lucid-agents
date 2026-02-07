# @lucid-agents/analytics

Payment analytics and reporting extension for Lucid Agents. Provides summary statistics, transaction history, and CSV/JSON export for accounting system integration.

## Installation

```bash
bun add @lucid-agents/analytics
```

## Usage

### As an Extension

```typescript
import { createAgent } from '@lucid-agents/core';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { analytics, getSummary, exportToCSV } from '@lucid-agents/analytics';

const agent = await createAgent({
  name: 'my-agent',
  version: '1.0.0',
})
  .use(payments({ config: paymentsFromEnv() }))
  .use(analytics())
  .build();

// Get payment summary for the last 24 hours
const summary = await getSummary(agent.analytics.paymentTracker, 86400000);
console.log(`Outgoing: ${summary.outgoingTotal}, Incoming: ${summary.incomingTotal}`);

// Export to CSV for accounting systems
const csv = await exportToCSV(agent.analytics.paymentTracker);
```

## API

### `analytics()`

Extension function that adds analytics capabilities to the agent runtime.

### Query Functions

- `getSummary(paymentTracker, windowMs?)` - Get combined outgoing/incoming summary
- `getOutgoingSummary(paymentTracker, windowMs?)` - Get outgoing payment summary
- `getIncomingSummary(paymentTracker, windowMs?)` - Get incoming payment summary
- `getAllTransactions(paymentTracker, windowMs?)` - Get all transactions
- `getAnalyticsData(paymentTracker, windowMs?)` - Get full analytics data

### Export Functions

- `exportToCSV(paymentTracker, windowMs?)` - Export transactions as CSV string
- `exportToJSON(paymentTracker, windowMs?)` - Export transactions as JSON string

## Types

- `AnalyticsSummary` - Summary statistics (totals, counts, averages)
- `Transaction` - Individual payment transaction record
- `AnalyticsData` - Combined analytics data object

## Related Packages

- [`@lucid-agents/payments`](../payments/README.md) - Payment processing (required for analytics)
- [`@lucid-agents/core`](../core/README.md) - Core agent runtime
