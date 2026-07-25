import type { PaymentMethod } from '@lucid-agents/types/a2a';
import type {
  AgentManifest,
  EntrypointDef,
  ManifestEntrypoint,
} from '@lucid-agents/types/core';
import type { MppConfig } from '@lucid-agents/types/mpp';
import { resolveMppOffers, type MppResolvedOffer } from './openapi';

function paymentMethodForOffer(offer: MppResolvedOffer): PaymentMethod {
  const { challengeAmount: _challengeAmount, ...publicOffer } = offer;
  return {
    method: 'mpp',
    network: 'mpp',
    priceModel: {
      default: publicOffer.amount ?? offer.challengeAmount,
    },
    extensions: {
      mpp: publicOffer,
    },
  };
}

function addPaymentMethod(
  payments: PaymentMethod[],
  seen: Set<string>,
  offer: MppResolvedOffer
): void {
  const payment = paymentMethodForOffer(offer);
  const key = JSON.stringify(payment);
  if (seen.has(key)) return;
  seen.add(key);
  payments.push(payment);
}

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
  const payments: PaymentMethod[] = [
    ...((card.payments ?? []) as PaymentMethod[]),
  ];
  const seenPayments = new Set(
    payments.map(payment => JSON.stringify(payment))
  );

  for (const [key, entrypoint] of Object.entries(card.entrypoints)) {
    const entrypointDef = entrypointList.find(e => e.key === key);
    if (!entrypointDef) {
      entrypointsWithPricing[key] = entrypoint;
      continue;
    }

    const invokeOffers = resolveMppOffers(config, entrypointDef, 'invoke');
    const streamOffers = entrypointDef.stream
      ? resolveMppOffers(config, entrypointDef, 'stream')
      : undefined;
    const invP = invokeOffers[0]?.challengeAmount;
    const strP = streamOffers?.[0]?.challengeAmount;

    const manifestEntry: ManifestEntrypoint = {
      ...entrypoint,
    };

    if (invP || strP) {
      const pricing: NonNullable<typeof manifestEntry.pricing> = {};
      if (invP) pricing.invoke = invP;
      if (strP) pricing.stream = strP;
      manifestEntry.pricing = pricing;
    }
    if (invokeOffers.length > 0 || (streamOffers?.length ?? 0) > 0) {
      manifestEntry.payment_protocol ??= 'mpp';
    }

    entrypointsWithPricing[key] = manifestEntry;

    for (const offer of invokeOffers) {
      addPaymentMethod(payments, seenPayments, offer);
    }
    for (const offer of streamOffers ?? []) {
      addPaymentMethod(payments, seenPayments, offer);
    }
  }

  return {
    ...card,
    entrypoints: entrypointsWithPricing,
    payments,
  };
}
