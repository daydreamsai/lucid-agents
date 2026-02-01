import type {
  AgentCardWithEntrypoints,
  Manifest,
  PaymentMethod,
} from '@lucid-agents/types/a2a';
import type { EntrypointDef } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';

import { resolvePrice } from './pricing';

/**
 * Creates a new Agent Card with payments metadata added.
 * Adds pricing to entrypoints and payments array to card.
 * Immutable - returns new card, doesn't mutate input.
 */
export function createAgentCardWithPayments(
  card: AgentCardWithEntrypoints,
  paymentsConfig: PaymentsConfig,
  entrypoints: Iterable<EntrypointDef>
): AgentCardWithEntrypoints {
  const entrypointList = Array.from(entrypoints);
  const entrypointsWithPricing: Manifest['entrypoints'] = {};

  // Add pricing to each entrypoint
  for (const [key, entrypoint] of Object.entries(card.entrypoints)) {
    const entrypointDef = entrypointList.find(e => e.key === key);
    if (!entrypointDef) {
      entrypointsWithPricing[key] = entrypoint;
      continue;
    }

    const invP = resolvePrice(entrypointDef, paymentsConfig, 'invoke');
    const strP = entrypointDef.stream
      ? resolvePrice(entrypointDef, paymentsConfig, 'stream')
      : undefined;

    const manifestEntry: Manifest['entrypoints'][string] = {
      ...entrypoint,
    };

    if (invP || strP) {
      const pricing: NonNullable<typeof manifestEntry.pricing> = {};
      if (invP) pricing.invoke = invP;
      if (strP) pricing.stream = strP;
      manifestEntry.pricing = pricing;
    }

    entrypointsWithPricing[key] = manifestEntry;
  }

  // Add payments array
  const paymentMethod: PaymentMethod = {
    method: 'x402',
    payee: paymentsConfig.payTo,
    network: paymentsConfig.network,
    endpoint: paymentsConfig.facilitatorUrl,
    extensions: {
      x402: { facilitatorUrl: paymentsConfig.facilitatorUrl },
    },
  };

  return {
    ...card,
    entrypoints: entrypointsWithPricing,
    payments: [paymentMethod],
  };
}
