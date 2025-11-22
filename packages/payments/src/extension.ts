import type {
  AgentCardWithEntrypoints,
  AgentRuntime,
  BuildContext,
  EntrypointDef,
  Extension,
} from '@lucid-agents/types/core';
import type {
  PaymentsConfig,
  PaymentsRuntime,
} from '@lucid-agents/types/payments';

import { createAgentCardWithPayments } from './manifest';
import { createPaymentsRuntime, entrypointHasExplicitPrice } from './payments';

export function payments(options?: {
  config?: PaymentsConfig | false;
}): Extension<{ payments?: PaymentsRuntime }> {
  let paymentsRuntime: PaymentsRuntime | undefined;

  return {
    name: 'payments',
    build(ctx: BuildContext): { payments?: PaymentsRuntime } {
      paymentsRuntime = createPaymentsRuntime(options?.config, ctx.config);
      return { payments: paymentsRuntime };
    },
    onEntrypointAdded(entrypoint: EntrypointDef, runtime: AgentRuntime) {
      if (
        paymentsRuntime &&
        !paymentsRuntime.isActive &&
        paymentsRuntime.config
      ) {
        if (entrypointHasExplicitPrice(entrypoint)) {
          paymentsRuntime.activate(entrypoint);
          // Update agent config with activated payments config
          (
            runtime.agent.config as { payments?: PaymentsConfig | false }
          ).payments = paymentsRuntime.config;
        }
      }
    },
    onManifestBuild(
      card: AgentCardWithEntrypoints,
      runtime: AgentRuntime
    ): AgentCardWithEntrypoints {
      if (paymentsRuntime?.config) {
        return createAgentCardWithPayments(
          card,
          paymentsRuntime.config,
          runtime.entrypoints.snapshot()
        );
      }
      return card;
    },
  };
}
