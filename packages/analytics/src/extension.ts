import type { BuildContext, Extension } from '@lucid-agents/types/core';
import type { AnalyticsRuntime } from '@lucid-agents/types/analytics';
import type { PaymentsRuntime } from '@lucid-agents/types/payments';

import {
  exportToCSV,
  exportToJSON,
  getAllTransactions,
  getAnalyticsData,
  getSummary,
} from './api';

type AnalyticsDependencies = { payments: PaymentsRuntime | undefined };

export function analytics(): Extension<
  { analytics: AnalyticsRuntime },
  AnalyticsDependencies
> {
  return {
    name: 'analytics',
    requires: ['payments'],
    build(ctx: BuildContext<AnalyticsDependencies>): {
      analytics: AnalyticsRuntime;
    } {
      const tracker = ctx.runtime.payments?.paymentTracker;
      if (!tracker) {
        throw new Error(
          'analytics() requires an enabled payments() runtime with storage'
        );
      }
      return {
        analytics: {
          getSummary: windowMs => getSummary(tracker, windowMs),
          getTransactions: windowMs => getAllTransactions(tracker, windowMs),
          getData: windowMs => getAnalyticsData(tracker, windowMs),
          exportCSV: windowMs => exportToCSV(tracker, windowMs),
          exportJSON: windowMs => exportToJSON(tracker, windowMs),
        },
      };
    },
  };
}
