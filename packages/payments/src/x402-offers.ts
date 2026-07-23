import type { EntrypointDef } from '@lucid-agents/types/core';
import type {
  PaymentsConfig,
  X402BatchSettlementOffer,
  X402ExactOffer,
  X402ExtensionDeclaration,
  X402Offer,
  X402OfferAmount,
  X402UptoOffer,
} from '@lucid-agents/types/payments';
import type { Network, Price } from '@x402/core/types';

import { resolvePayTo, type DynamicPayToResolver } from './payto-resolver';
import { resolvePrice } from './pricing';
import { normalizePaymentNetwork } from './validation';

export type CompiledExactX402Offer = {
  scheme: 'exact';
  network: Network;
  price: Price;
  payTo: string | DynamicPayToResolver;
  facilitatorUrl: string;
  extensions: readonly X402ExtensionDeclaration[];
  publicOffer: X402ExactOffer;
};

export type CompiledBatchSettlementX402Offer = {
  scheme: 'batch-settlement';
  network: `eip155:${string}`;
  price: Price;
  payTo: `0x${string}`;
  facilitatorUrl: string;
  extensions: readonly X402ExtensionDeclaration[];
  publicOffer: X402BatchSettlementOffer;
};

export type CompiledUptoX402Offer = {
  scheme: 'upto';
  network: `eip155:${string}`;
  price: Price;
  payTo: string | DynamicPayToResolver;
  facilitatorUrl: string;
  extensions: readonly X402ExtensionDeclaration[];
  publicOffer: X402UptoOffer;
};

export type CompiledX402Offer =
  | CompiledExactX402Offer
  | CompiledUptoX402Offer
  | CompiledBatchSettlementX402Offer;

export type CompiledX402Offers = {
  source: 'legacy' | 'config' | 'entrypoint';
  offers: readonly CompiledX402Offer[];
};

function assertNonEmpty(value: string, field: string, entrypointKey: string) {
  if (!value.trim()) {
    throw new Error(
      `x402 ${field} must be non-empty for entrypoint "${entrypointKey}"`
    );
  }
}

function validateFacilitatorUrl(value: string, entrypointKey: string): string {
  assertNonEmpty(value, 'facilitatorUrl', entrypointKey);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `x402 facilitatorUrl must be a valid HTTP(S) URL for entrypoint "${entrypointKey}"`
    );
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(
      `x402 facilitatorUrl must use HTTP(S) for entrypoint "${entrypointKey}"`
    );
  }
  if (url.username || url.password) {
    throw new Error(
      `x402 facilitatorUrl must not contain credentials for entrypoint "${entrypointKey}"; use facilitatorAuth instead`
    );
  }
  url.hash = '';
  return url.toString().replace(/\/$/u, '');
}

function compileAmount(amount: X402OfferAmount, entrypointKey: string): Price {
  if (typeof amount === 'string') {
    assertNonEmpty(amount, 'price', entrypointKey);
    return amount;
  }
  assertNonEmpty(amount.amount, 'token amount', entrypointKey);
  assertNonEmpty(amount.asset, 'asset', entrypointKey);
  return {
    amount: amount.amount,
    asset: amount.asset,
  };
}

function compileExactOffer(
  offer: X402ExactOffer,
  config: PaymentsConfig,
  entrypointKey: string
): CompiledExactX402Offer {
  const network = normalizePaymentNetwork(offer.network) as Network;
  const facilitatorUrl = validateFacilitatorUrl(
    offer.facilitatorUrl ?? config.facilitatorUrl,
    entrypointKey
  );
  const payTo = offer.payTo?.trim() || resolvePayTo(config);
  if (typeof payTo === 'string') {
    assertNonEmpty(payTo, 'payTo', entrypointKey);
  }
  const publicOffer: X402ExactOffer = {
    ...offer,
    network,
    facilitatorUrl,
    ...(typeof payTo === 'string' ? { payTo } : {}),
  };

  return {
    scheme: 'exact',
    network,
    price: compileAmount(offer.price, entrypointKey),
    payTo,
    facilitatorUrl,
    extensions: offer.extensions ?? [],
    publicOffer,
  };
}

function compileBatchSettlementOffer(
  offer: X402BatchSettlementOffer,
  config: PaymentsConfig,
  entrypointKey: string
): CompiledBatchSettlementX402Offer {
  const network = normalizePaymentNetwork(offer.network);
  if (!network.startsWith('eip155:')) {
    throw new Error(
      `x402 batch-settlement requires an EVM network for entrypoint "${entrypointKey}"`
    );
  }
  const facilitatorUrl = validateFacilitatorUrl(
    offer.facilitatorUrl ?? config.facilitatorUrl,
    entrypointKey
  );
  const payTo = offer.payTo?.trim() || resolvePayTo(config);
  if (typeof payTo !== 'string' || !/^0x[0-9a-fA-F]{40}$/u.test(payTo)) {
    throw new Error(
      `x402 batch-settlement requires a static EVM payTo address for entrypoint "${entrypointKey}"`
    );
  }
  const typedNetwork = network as `eip155:${string}`;
  const typedPayTo = payTo as `0x${string}`;
  const publicOffer: X402BatchSettlementOffer = {
    ...offer,
    network: typedNetwork,
    maximum: offer.maximum,
    facilitatorUrl,
    payTo: typedPayTo,
  };

  return {
    scheme: 'batch-settlement',
    network: typedNetwork,
    price: compileAmount(offer.maximum, entrypointKey),
    payTo: typedPayTo,
    facilitatorUrl,
    extensions: offer.extensions ?? [],
    publicOffer,
  };
}

function compileUptoOffer(
  offer: X402UptoOffer,
  config: PaymentsConfig,
  entrypointKey: string
): CompiledUptoX402Offer {
  const network = normalizePaymentNetwork(offer.network);
  if (!network.startsWith('eip155:')) {
    throw new Error(
      `x402 upto requires an EVM network for entrypoint "${entrypointKey}"`
    );
  }
  const facilitatorUrl = validateFacilitatorUrl(
    offer.facilitatorUrl ?? config.facilitatorUrl,
    entrypointKey
  );
  const payTo = offer.payTo?.trim() || resolvePayTo(config);
  if (typeof payTo === 'string') {
    assertNonEmpty(payTo, 'payTo', entrypointKey);
  }
  const typedNetwork = network as `eip155:${string}`;
  const publicOffer: X402UptoOffer = {
    ...offer,
    network: typedNetwork,
    facilitatorUrl,
    ...(typeof payTo === 'string' ? { payTo } : {}),
  };
  return {
    scheme: 'upto',
    network: typedNetwork,
    price: compileAmount(offer.maximum, entrypointKey),
    payTo,
    facilitatorUrl,
    extensions: offer.extensions ?? [],
    publicOffer,
  };
}

function compileOffer(
  offer: X402Offer,
  config: PaymentsConfig,
  entrypointKey: string
): CompiledX402Offer {
  if (offer.scheme === 'exact') {
    return compileExactOffer(offer, config, entrypointKey);
  }
  if (offer.scheme === 'batch-settlement') {
    return compileBatchSettlementOffer(offer, config, entrypointKey);
  }
  if (offer.scheme === 'upto') {
    return compileUptoOffer(offer, config, entrypointKey);
  }
  const unsupported: never = offer;
  throw new Error(
    `Unsupported x402 scheme for entrypoint "${entrypointKey}": ${String(unsupported)}`
  );
}

function sourceOffers(
  entrypoint: EntrypointDef,
  config: PaymentsConfig,
  kind: 'invoke' | 'stream' | 'task'
):
  | { source: CompiledX402Offers['source']; offers: readonly X402Offer[] }
  | undefined {
  if (entrypoint.paymentProtocol === 'mpp') return undefined;

  if (entrypoint.x402) {
    if (entrypoint.x402.offers.length === 0) {
      throw new Error(
        `Entrypoint "${entrypoint.key}" must declare at least one x402 offer`
      );
    }
    return { source: 'entrypoint', offers: entrypoint.x402.offers };
  }

  const legacyPrice = resolvePrice(
    entrypoint,
    config,
    kind === 'task' ? 'invoke' : kind
  );
  const explicitlySelectsX402 = entrypoint.paymentProtocol === 'x402';
  if (
    config.offers &&
    config.offers.length > 0 &&
    (legacyPrice !== null || explicitlySelectsX402)
  ) {
    return { source: 'config', offers: config.offers };
  }

  if (legacyPrice === null) return undefined;
  return {
    source: 'legacy',
    offers: [
      {
        scheme: 'exact',
        network: entrypoint.network ?? config.network,
        price: legacyPrice,
      },
    ],
  };
}

/**
 * Compile public Lucid offer contracts into x402 SDK route inputs.
 *
 * Entrypoint offers take precedence. Config-level offers only apply when an
 * entrypoint already opts into x402 with a legacy price or paymentProtocol.
 */
export function compileX402Offers(
  entrypoint: EntrypointDef,
  config: PaymentsConfig,
  kind: 'invoke' | 'stream' | 'task'
): CompiledX402Offers | undefined {
  const selected = sourceOffers(entrypoint, config, kind);
  if (!selected) return undefined;
  if (
    kind !== 'invoke' &&
    selected.offers.some(offer => offer.scheme === 'upto')
  ) {
    throw new Error(
      `x402 upto only supports invoke operations; entrypoint "${entrypoint.key}" cannot use it for ${kind}`
    );
  }
  const offers = selected.offers.map(offer =>
    compileOffer(offer, config, entrypoint.key)
  );
  const facilitatorByKind = new Map<string, string>();
  for (const offer of offers) {
    const kindKey = `${offer.scheme}|${offer.network}`;
    const current = facilitatorByKind.get(kindKey);
    if (current && current !== offer.facilitatorUrl) {
      throw new Error(
        `x402 offers for ${offer.scheme} on ${offer.network} must use one facilitator`
      );
    }
    facilitatorByKind.set(kindKey, offer.facilitatorUrl);
  }
  const batchReceivers = new Set(
    offers
      .filter(
        (offer): offer is CompiledBatchSettlementX402Offer =>
          offer.scheme === 'batch-settlement'
      )
      .map(offer => offer.payTo.toLowerCase())
  );
  if (batchReceivers.size > 1) {
    throw new Error(
      `x402 batch-settlement offers for entrypoint "${entrypoint.key}" must use one receiver`
    );
  }
  return {
    source: selected.source,
    offers,
  };
}

export function compileX402Extensions(
  offers: readonly CompiledX402Offer[],
  entrypointKey: string
): Record<string, unknown> | undefined {
  const declarations: Record<string, unknown> = {};
  for (const offer of offers) {
    for (const extension of offer.extensions) {
      assertNonEmpty(extension.key, 'extension key', entrypointKey);
      const declaration = extension.info ?? {};
      const existing = declarations[extension.key];
      if (
        existing !== undefined &&
        JSON.stringify(existing) !== JSON.stringify(declaration)
      ) {
        throw new Error(
          `Conflicting x402 extension "${extension.key}" declarations for entrypoint "${entrypointKey}"`
        );
      }
      declarations[extension.key] = declaration;
    }
  }
  return Object.keys(declarations).length > 0 ? declarations : undefined;
}
