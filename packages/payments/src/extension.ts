import type { AgentCardWithEntrypoints } from '@lucid-agents/types/a2a';
import type {
  AgentRuntime,
  BuildContext,
  EntrypointDef,
  Extension,
} from '@lucid-agents/types/core';
import type {
  PaymentsConfig,
  PaymentsRuntime,
  PaymentStorageConfig,
} from '@lucid-agents/types/payments';

import { policiesFromConfig } from './env';
import { createAgentCardWithPayments } from './manifest';
import type { PaymentStorage } from './payment-storage';
import { createPaymentsRuntime, entrypointHasExplicitPrice } from './payments';

type PaymentStorageFactory = (
  storageConfig?: PaymentStorageConfig,
  agentId?: string
) => PaymentStorage;

export function payments(options?: {
  config?: PaymentsConfig | false;
  policies?: string;
  agentId?: string;
  storageFactory?: PaymentStorageFactory;
}): Extension<{ payments?: PaymentsRuntime }> {
  let paymentsRuntime: PaymentsRuntime | undefined;

  return {
    name: 'payments',
    build(ctx: BuildContext): { payments?: PaymentsRuntime } {
      let config = options?.config;

      if (config !== false && config !== undefined && options?.policies) {
        try {
          const policyGroups = policiesFromConfig(options.policies);
          if (policyGroups) {
            config = { ...config, policyGroups };
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          throw new Error(`Failed to load policies from config: ${message}`, {
            cause: error,
          });
        }
      }

      paymentsRuntime = createPaymentsRuntime(
        config,
        options?.agentId,
        options?.storageFactory
      );
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
