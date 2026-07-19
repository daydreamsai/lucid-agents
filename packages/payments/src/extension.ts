import type {
  AgentManifest,
  AgentRuntime,
  EntrypointDef,
  Extension,
} from '@lucid-agents/types/core';
import type {
  PaymentsConfig,
  PaymentsRuntime,
} from '@lucid-agents/types/payments';

import { createAgentCardWithPayments } from './manifest';
import {
  createPaymentsRuntime,
  entrypointHasExplicitPrice,
  type PaymentStorageFactory,
  type SIWxStorageFactory,
} from './payments';

export function payments(options?: {
  config?: PaymentsConfig | false;
  agentId?: string;
  storageFactory?: PaymentStorageFactory;
  siwxStorageFactory?: SIWxStorageFactory;
}): Extension<{ payments: PaymentsRuntime | undefined }> {
  let paymentsRuntime: PaymentsRuntime | undefined;

  return {
    name: 'payments',
    after: ['wallets'],
    build(): { payments: PaymentsRuntime | undefined } {
      paymentsRuntime = createPaymentsRuntime(
        options?.config,
        options?.agentId,
        options?.storageFactory,
        options?.siwxStorageFactory
      );
      return { payments: paymentsRuntime };
    },
    onEntrypointAdded(entrypoint: EntrypointDef) {
      if (
        paymentsRuntime &&
        !paymentsRuntime.isActive &&
        paymentsRuntime.config
      ) {
        if (
          entrypointHasExplicitPrice(entrypoint) ||
          entrypoint.siwx?.authOnly
        ) {
          paymentsRuntime.activate(entrypoint);
        }
      }
    },
    onManifestBuild(card: AgentManifest, runtime: AgentRuntime): AgentManifest {
      if (paymentsRuntime?.config) {
        return createAgentCardWithPayments(
          card,
          paymentsRuntime.config,
          runtime.entrypoints.snapshot()
        );
      }
      return card;
    },
    async dispose() {
      await paymentsRuntime?.close();
    },
  };
}
