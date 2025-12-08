import {
  analytics,
  exportToCSV,
  exportToJSON,
  getAllTransactions,
  getIncomingSummary,
  getOutgoingSummary,
  getSummary,
} from '@lucid-agents/analytics';
import { createAgent } from '@lucid-agents/core';
import { createAgentApp } from '@lucid-agents/hono';
import { http } from '@lucid-agents/http';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { z } from 'zod';

/**
 * Agent that demonstrates analytics usage for payment tracking.
 *
 * This agent shows how to use the analytics extension to:
 * - Get payment summaries (outgoing, incoming, net)
 * - Query transaction history
 * - Export data to CSV/JSON
 * - Access analytics data from entrypoint handlers
 *
 * Required environment variables (see env.example):
 *   - FACILITATOR_URL - x402 facilitator endpoint
 *   - PAYMENTS_RECEIVABLE_ADDRESS - This agent's payment address
 *   - NETWORK - Network identifier (e.g., base-sepolia)
 *
 * How to test:
 * 1. Copy env.example to .env and configure
 * 2. Start this agent: bun run packages/examples/src/analytics
 * 3. Call the analytics entrypoints to see payment data
 *
 * Analytics features demonstrated:
 * - Summary statistics (totals, counts, time windows)
 * - Transaction history with filtering
 * - CSV and JSON export
 * - Time-windowed queries
 *
 * Run: bun run packages/examples/src/analytics
 */

const agent = await createAgent({
  name: 'analytics-agent',
  version: '1.0.0',
  description: 'Agent demonstrating payment analytics',
})
  .use(http())
  .use(payments({ config: paymentsFromEnv() }))
  .use(analytics())
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

/**
 * Get payment summary for a time window.
 * Shows outgoing, incoming, and net totals.
 */
addEntrypoint({
  key: 'summary',
  description: 'Get payment summary statistics',
  input: z.object({
    windowHours: z.number().optional().default(24),
  }),
  output: z.object({
    summary: z.object({
      outgoingTotal: z.string(),
      incomingTotal: z.string(),
      netTotal: z.string(),
      outgoingCount: z.number(),
      incomingCount: z.number(),
      windowStart: z.number().optional(),
      windowEnd: z.number().optional(),
    }),
  }),
  async handler({ input, runtime }) {
    if (!runtime?.analytics?.paymentTracker) {
      throw new Error('Analytics not available');
    }

    const windowMs = input.windowHours * 60 * 60 * 1000;
    const summary = await getSummary(
      runtime.analytics.paymentTracker,
      windowMs
    );

    return {
      output: {
        summary: {
          outgoingTotal: summary.outgoingTotal.toString(),
          incomingTotal: summary.incomingTotal.toString(),
          netTotal: summary.netTotal.toString(),
          outgoingCount: summary.outgoingCount,
          incomingCount: summary.incomingCount,
          windowStart: summary.windowStart,
          windowEnd: summary.windowEnd,
        },
      },
    };
  },
});

/**
 * Get outgoing payment summary.
 */
addEntrypoint({
  key: 'outgoing-summary',
  description: 'Get outgoing payment summary',
  input: z.object({
    windowHours: z.number().optional().default(24),
  }),
  output: z.object({
    outgoingTotal: z.string(),
    outgoingCount: z.number(),
  }),
  async handler({ input, runtime }) {
    if (!runtime?.analytics?.paymentTracker) {
      throw new Error('Analytics not available');
    }

    const windowMs = input.windowHours * 60 * 60 * 1000;
    const summary = await getOutgoingSummary(
      runtime.analytics.paymentTracker,
      windowMs
    );

    return {
      output: {
        outgoingTotal: summary.outgoingTotal.toString(),
        outgoingCount: summary.outgoingCount,
      },
    };
  },
});

/**
 * Get incoming payment summary.
 */
addEntrypoint({
  key: 'incoming-summary',
  description: 'Get incoming payment summary',
  input: z.object({
    windowHours: z.number().optional().default(24),
  }),
  output: z.object({
    incomingTotal: z.string(),
    incomingCount: z.number(),
  }),
  async handler({ input, runtime }) {
    if (!runtime?.analytics?.paymentTracker) {
      throw new Error('Analytics not available');
    }

    const windowMs = input.windowHours * 60 * 60 * 1000;
    const summary = await getIncomingSummary(
      runtime.analytics.paymentTracker,
      windowMs
    );

    return {
      output: {
        incomingTotal: summary.incomingTotal.toString(),
        incomingCount: summary.incomingCount,
      },
    };
  },
});

/**
 * Get all transactions with optional filtering.
 */
addEntrypoint({
  key: 'transactions',
  description: 'Get transaction history',
  input: z.object({
    windowHours: z.number().optional(),
    direction: z.enum(['outgoing', 'incoming']).optional(),
  }),
  output: z.object({
    transactions: z.array(
      z.object({
        id: z.number().optional(),
        groupName: z.string(),
        scope: z.string(),
        direction: z.string(),
        amountUsdc: z.string(),
        timestamp: z.number(),
        timestampIso: z.string(),
      })
    ),
  }),
  async handler({ input, runtime }) {
    if (!runtime?.analytics?.paymentTracker) {
      throw new Error('Analytics not available');
    }

    const windowMs = input.windowHours
      ? input.windowHours * 60 * 60 * 1000
      : undefined;
    let transactions = await getAllTransactions(
      runtime.analytics.paymentTracker,
      windowMs
    );

    if (input.direction) {
      transactions = transactions.filter(t => t.direction === input.direction);
    }

    return {
      output: {
        transactions: transactions.map(t => ({
          id: t.id,
          groupName: t.groupName,
          scope: t.scope,
          direction: t.direction,
          amountUsdc: t.amountUsdc,
          timestamp: t.timestamp,
          timestampIso: t.timestampIso,
        })),
      },
    };
  },
});

/**
 * Export payment data to CSV.
 */
addEntrypoint({
  key: 'export-csv',
  description: 'Export payment data to CSV format',
  input: z.object({
    windowHours: z.number().optional(),
  }),
  output: z.object({
    csv: z.string(),
    rowCount: z.number(),
  }),
  async handler({ input, runtime }) {
    if (!runtime?.analytics?.paymentTracker) {
      throw new Error('Analytics not available');
    }

    const windowMs = input.windowHours
      ? input.windowHours * 60 * 60 * 1000
      : undefined;
    const csv = await exportToCSV(runtime.analytics.paymentTracker, windowMs);
    const lines = csv.split('\n').filter(line => line.trim().length > 0);
    const rowCount = lines.length - 1;

    return {
      output: {
        csv,
        rowCount,
      },
    };
  },
});

/**
 * Export payment data to JSON.
 */
addEntrypoint({
  key: 'export-json',
  description: 'Export payment data to JSON format',
  input: z.object({
    windowHours: z.number().optional(),
  }),
  output: z.object({
    data: z.object({
      summary: z.any(),
      transactions: z.array(z.any()),
    }),
  }),
  async handler({ input, runtime }) {
    if (!runtime?.analytics?.paymentTracker) {
      throw new Error('Analytics not available');
    }

    const windowMs = input.windowHours
      ? input.windowHours * 60 * 60 * 1000
      : undefined;
    const jsonString = await exportToJSON(
      runtime.analytics.paymentTracker,
      windowMs
    );
    const data = JSON.parse(jsonString);

    return {
      output: {
        data,
      },
    };
  },
});

const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(
  `Analytics agent ready at http://${server.hostname}:${server.port}/.well-known/agent.json`
);
console.log('\nAvailable analytics entrypoints:');
console.log('  - /entrypoints/summary/invoke - Get payment summary');
console.log('  - /entrypoints/outgoing-summary/invoke - Get outgoing summary');
console.log('  - /entrypoints/incoming-summary/invoke - Get incoming summary');
console.log('  - /entrypoints/transactions/invoke - Get transaction history');
console.log('  - /entrypoints/export-csv/invoke - Export to CSV');
console.log('  - /entrypoints/export-json/invoke - Export to JSON');
