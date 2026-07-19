import type { PaymentMethod } from '@lucid-agents/types/a2a';
import type {
  AgentManifest,
  EntrypointDef,
  ManifestEntrypoint,
} from '@lucid-agents/types/core';
import type { MppConfig } from '@lucid-agents/types/mpp';
import { resolveEntrypointPrice } from './challenge';

/**
 * Creates a new Agent Card with MPP payment metadata.
 * Adds pricing to entrypoints and MPP payment methods to the card.
 * Immutable - returns new card, doesn't mutate input.
 */
export function buildManifestWithMpp(
  card: AgentManifest,
  config: MppConfig,
  entrypoints: Iterable<EntrypointDef>
): AgentManifest {
  const entrypointList = Array.from(entrypoints);
  const entrypointsWithPricing: AgentManifest['entrypoints'] = {};

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

    const manifestEntry: ManifestEntrypoint = {
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
  const payments: PaymentMethod[] = config.methods.map(method => {
    const methodCurrency = (method.config as { currency?: unknown }).currency;
    return {
      method: `mpp` as const,
      network: 'mpp',
      extensions: {
        mpp: {
          method: method.name,
          intent: config.defaultIntent ?? 'charge',
          currency:
            typeof methodCurrency === 'string'
              ? methodCurrency
              : (config.currency ?? 'usd'),
          ...(config.session ? { session: config.session } : {}),
        },
      },
    };
  });

  // Merge with existing payments (don't overwrite x402 if present)
  const existingPayments = card.payments ?? [];

  return {
    ...card,
    entrypoints: entrypointsWithPricing,
    payments: [...existingPayments, ...payments],
  };
}
