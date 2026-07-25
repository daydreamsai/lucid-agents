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
import type { BatchSettlementServerOptions } from './batch-settlement';
import type { X402ReconciliationOptions } from './x402-reconciliation';

export function payments(options?: {
  config?: PaymentsConfig | false;
  agentId?: string;
  storageFactory?: PaymentStorageFactory;
  siwxStorageFactory?: SIWxStorageFactory;
  batchSettlement?: BatchSettlementServerOptions;
  reconciliation?: X402ReconciliationOptions;
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
        options?.siwxStorageFactory,
        options?.batchSettlement,
        options?.reconciliation
      );
      return { payments: paymentsRuntime };
    },
    onEntrypointAdded(entrypoint: EntrypointDef) {
      if (paymentsRuntime && paymentsRuntime.config) {
        if (
          entrypointHasExplicitPrice(entrypoint) ||
          entrypoint.paymentProtocol === 'x402' ||
          entrypoint.x402 !== undefined ||
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
