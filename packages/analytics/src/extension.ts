import type { BuildContext, Extension } from '@lucid-agents/types/core';
import type { AnalyticsRuntime } from '@lucid-agents/types/analytics';
import type { PaymentTracker } from '@lucid-agents/types/payments';

export function analytics(): Extension<AnalyticsRuntime> {
  return {
    name: 'analytics',
    build(ctx: BuildContext): AnalyticsRuntime {
      return {
        get paymentTracker() {
          return ctx.runtime.payments?.paymentTracker as
            | PaymentTracker
            | undefined;
        },
      };
    },
  };
}
