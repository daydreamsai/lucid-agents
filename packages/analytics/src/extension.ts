import type {
  AgentRuntime,
  BuildContext,
  Extension,
} from '@lucid-agents/types/core';
import type { AnalyticsRuntime } from '@lucid-agents/types/analytics';
import type { PaymentTracker } from '@lucid-agents/types/payments';

export function analytics(): Extension<{ analytics: AnalyticsRuntime }> {
  return {
    name: 'analytics',
    build(_ctx: BuildContext): { analytics: AnalyticsRuntime } {
      return {
        analytics: {} as AnalyticsRuntime,
      };
    },
    onBuild(runtime: AgentRuntime) {
      const analyticsRuntime: AnalyticsRuntime = {
        get paymentTracker() {
          return runtime.payments?.paymentTracker as PaymentTracker | undefined;
        },
      };
      runtime.analytics = analyticsRuntime;
    },
  };
}
