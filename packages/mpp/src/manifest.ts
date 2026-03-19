import type { AgentCardWithEntrypoints, Manifest, PaymentMethod } from '@lucid-agents/types/a2a';
import type { EntrypointDef } from '@lucid-agents/types/core';
import type { MppConfig } from './types';
import { resolveEntrypointPrice, resolveEntrypointMppConfig } from './challenge';

/**
 * Creates a new Agent Card with MPP payment metadata.
 * Adds pricing to entrypoints and MPP payment methods to the card.
 * Immutable - returns new card, doesn't mutate input.
 */
export function buildManifestWithMpp(
  card: AgentCardWithEntrypoints,
  config: MppConfig,
  entrypoints: Iterable<EntrypointDef>
): AgentCardWithEntrypoints {
  const entrypointList = Array.from(entrypoints);
  const entrypointsWithPricing: Manifest['entrypoints'] = {};

  for (const [key, entrypoint] of Object.entries(card.entrypoints)) {
    const entrypointDef = entrypointList.find(e => e.key === key);
    if (!entrypointDef) {
      entrypointsWithPricing[key] = entrypoint;
      continue;
    }

    const invP = resolveEntrypointPrice(entrypointDef, 'invoke');
    const strP = entrypointDef.stream
      ? resolveEntrypointPrice(entrypointDef, 'stream')
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

  // Build MPP payment methods array
  const payments: PaymentMethod[] = config.methods.map(method => ({
    method: `mpp` as const,
    network: 'mpp',
    extensions: {
      mpp: {
        method: method.name,
        intent: config.defaultIntent ?? 'charge',
        currency: config.currency ?? 'usd',
        ...(config.session ? { session: config.session } : {}),
      },
    },
  }));

  // Merge with existing payments (don't overwrite x402 if present)
  const existingPayments = card.payments ?? [];

  return {
    ...card,
    entrypoints: entrypointsWithPricing,
    payments: [...existingPayments, ...payments],
  };
}
