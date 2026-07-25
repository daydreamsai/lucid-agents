import type { PaymentMethod } from '@lucid-agents/types/a2a';
import type {
  AgentManifest,
  EntrypointDef,
  ManifestEntrypoint,
} from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';

import { compileX402Offers, type CompiledX402Offer } from './x402-offers';

function offerAmount(offer: CompiledX402Offer): string {
  return typeof offer.price === 'object'
    ? offer.price.amount
    : String(offer.price);
}

function paymentMethodForOffer(offer: CompiledX402Offer): PaymentMethod {
  const payee = typeof offer.payTo === 'string' ? offer.payTo : undefined;
  return {
    method: 'x402',
    ...(payee ? { payee } : {}),
    network: offer.network,
    endpoint: offer.facilitatorUrl,
    priceModel: { default: offerAmount(offer) },
    extensions: {
      x402: {
        ...offer.publicOffer,
        ...(!payee ? { payeeMode: 'dynamic' as const } : {}),
      },
    },
  };
}

function addPaymentMethod(
  payments: PaymentMethod[],
  seen: Set<string>,
  offer: CompiledX402Offer
): void {
  const payment = paymentMethodForOffer(offer);
  const key = JSON.stringify(payment);
  if (seen.has(key)) return;
  seen.add(key);
  payments.push(payment);
}

function configuredPaymentMethod(config: PaymentsConfig): PaymentMethod {
  const isDynamicPayee = !('payTo' in config);
  return {
    method: 'x402',
    ...('payTo' in config ? { payee: config.payTo } : {}),
    network: config.network,
    endpoint: config.facilitatorUrl,
    extensions: {
      x402: {
        facilitatorUrl: config.facilitatorUrl,
        ...(isDynamicPayee ? { payeeMode: 'dynamic' as const } : {}),
      },
    },
  };
}

function addDistinctPaymentMethod(
  payments: PaymentMethod[],
  seen: Set<string>,
  payment: PaymentMethod
): void {
  const key = JSON.stringify(payment);
  if (seen.has(key)) return;
  seen.add(key);
  payments.push(payment);
}

/**
 * Creates a new Agent Card with payments metadata added.
 * Adds pricing to entrypoints and payments array to card.
 * Immutable - returns new card, doesn't mutate input.
 */
export function createAgentCardWithPayments(
  card: AgentManifest,
  paymentsConfig: PaymentsConfig,
  entrypoints: Iterable<EntrypointDef>
): AgentManifest & { payments: PaymentMethod[] } {
  const entrypointList = Array.from(entrypoints);
  const entrypointsWithPricing: AgentManifest['entrypoints'] = {};
  const payments: PaymentMethod[] = [
    ...((card.payments ?? []) as PaymentMethod[]),
  ];
  const seenPayments = new Set(
    payments.map(payment => JSON.stringify(payment))
  );
  const projectedEntrypoints = new Set<string>();
  let resolvedOfferCount = 0;

  for (const [key, entrypoint] of Object.entries(card.entrypoints)) {
    const entrypointDef = entrypointList.find(e => e.key === key);
    if (!entrypointDef) {
      entrypointsWithPricing[key] = entrypoint;
      continue;
    }
    projectedEntrypoints.add(key);

    const invokeCompilation = compileX402Offers(
      entrypointDef,
      paymentsConfig,
      'invoke'
    );
    const streamCompilation = entrypointDef.stream
      ? compileX402Offers(entrypointDef, paymentsConfig, 'stream')
      : undefined;
    const invokeOffers = invokeCompilation?.offers;
    const streamOffers = streamCompilation?.offers;
    const invP = invokeOffers?.[0] ? offerAmount(invokeOffers[0]) : undefined;
    const strP = streamOffers?.[0] ? offerAmount(streamOffers[0]) : undefined;

    const manifestEntry: ManifestEntrypoint = {
      ...entrypoint,
    };
    const resolvedOffers = [...(invokeOffers ?? []), ...(streamOffers ?? [])];
    resolvedOfferCount += resolvedOffers.length;

    if (invP || strP) {
      const pricing: NonNullable<typeof manifestEntry.pricing> = {};
      if (invP) pricing.invoke = invP;
      if (strP) pricing.stream = strP;
      manifestEntry.pricing = pricing;
    }
    if (resolvedOffers.length > 0) {
      manifestEntry.payment_protocol ??= 'x402';
      const networks = new Set(resolvedOffers.map(offer => offer.network));
      if (!manifestEntry.network && networks.size === 1) {
        manifestEntry.network = resolvedOffers[0]?.network;
      }
    }

    entrypointsWithPricing[key] = manifestEntry;

    for (const offer of invokeOffers ?? []) {
      addPaymentMethod(payments, seenPayments, offer);
    }
    for (const offer of streamOffers ?? []) {
      addPaymentMethod(payments, seenPayments, offer);
    }
  }

  // Manifest builders normally receive a card containing the same registry
  // snapshot. Still project canonical methods if a custom caller supplies an
  // incomplete card, preserving the public helper's previous behavior.
  for (const entrypoint of entrypointList) {
    if (projectedEntrypoints.has(entrypoint.key)) continue;
    const invokeOffers =
      compileX402Offers(entrypoint, paymentsConfig, 'invoke')?.offers ?? [];
    const streamOffers = entrypoint.stream
      ? (compileX402Offers(entrypoint, paymentsConfig, 'stream')?.offers ?? [])
      : [];
    resolvedOfferCount += invokeOffers.length + streamOffers.length;
    for (const offer of [...invokeOffers, ...streamOffers]) {
      addPaymentMethod(payments, seenPayments, offer);
    }
  }

  // A configured rail remains discoverable even before a paid entrypoint is
  // registered. Entrypoint-specific offer terms take precedence once present.
  if (resolvedOfferCount === 0) {
    addDistinctPaymentMethod(
      payments,
      seenPayments,
      configuredPaymentMethod(paymentsConfig)
    );
  }

  return {
    ...card,
    entrypoints: entrypointsWithPricing,
    payments,
  };
}
