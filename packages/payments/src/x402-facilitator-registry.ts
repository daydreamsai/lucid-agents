import type { FacilitatorClient } from '@x402/core/server';

import type { CompiledX402Offer, CompiledX402Offers } from './x402-offers';

type FacilitatorEntry = {
  url: string;
  client: FacilitatorClient;
  supported: ReturnType<FacilitatorClient['getSupported']>;
};

/** Safe, non-secret facilitator configuration error for public responses. */
export class X402FacilitatorConfigurationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'X402FacilitatorConfigurationError';
  }
}

function supportsOffer(
  entry: FacilitatorEntry,
  offer: CompiledX402Offer,
  supported: Awaited<FacilitatorEntry['supported']>
): boolean {
  const supportedKind = supported.kinds.find(
    kind =>
      kind.x402Version === 2 &&
      kind.scheme === offer.scheme &&
      kind.network === offer.network
  );
  if (
    offer.scheme === 'upto' &&
    !/^0x[0-9a-fA-F]{40}$/u.test(
      String(supportedKind?.extra?.facilitatorAddress ?? '')
    )
  ) {
    return false;
  }
  return entry.url === offer.facilitatorUrl && supportedKind !== undefined;
}

/**
 * Create an ordered facilitator registry with one cached `/supported` request
 * per URL. Explicit offers are validated against their own declared
 * facilitator rather than the aggregate capabilities of every facilitator.
 */
export async function createFacilitatorRegistry(
  compiled: CompiledX402Offers,
  createClient: (url: string) => FacilitatorClient
): Promise<FacilitatorClient[]> {
  const entries: FacilitatorEntry[] = [];
  for (const offer of compiled.offers) {
    if (entries.some(entry => entry.url === offer.facilitatorUrl)) continue;
    const client = createClient(offer.facilitatorUrl);
    entries.push({
      url: offer.facilitatorUrl,
      client,
      supported: client.getSupported(),
    });
  }

  if (compiled.source !== 'legacy') {
    let supported: Array<{
      entry: FacilitatorEntry;
      response: Awaited<FacilitatorEntry['supported']>;
    }>;
    try {
      supported = await Promise.all(
        entries.map(async entry => ({
          entry,
          response: await entry.supported,
        }))
      );
    } catch {
      throw new Error('x402 facilitator capability discovery failed.');
    }
    const unsupported = compiled.offers.filter(offer => {
      const result = supported.find(
        candidate => candidate.entry.url === offer.facilitatorUrl
      );
      return !result || !supportsOffer(result.entry, offer, result.response);
    });
    if (unsupported.length > 0) {
      throw new X402FacilitatorConfigurationError(
        `Configured x402 facilitators do not support their declared offers: ${unsupported
          .map(offer => `${offer.scheme} on ${offer.network}`)
          .join('; ')}.`
      );
    }
  }

  return entries.map(({ client, supported }) => ({
    getSupported: () => supported,
    verify: (payload, requirements) => client.verify(payload, requirements),
    settle: (payload, requirements) => client.settle(payload, requirements),
  }));
}
