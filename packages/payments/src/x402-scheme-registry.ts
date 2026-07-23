import { ExactEvmScheme } from '@x402/evm/exact/server';
import { BatchSettlementEvmScheme } from '@x402/evm/batch-settlement/server';
import { UptoEvmScheme } from '@x402/evm/upto/server';
import type { x402ResourceServer } from '@x402/core/server';

import type { ResolvedBatchSettlementServerOptions } from './batch-settlement';
import type {
  CompiledBatchSettlementX402Offer,
  CompiledExactX402Offer,
  CompiledX402Offer,
  CompiledUptoX402Offer,
} from './x402-offers';

function networkNamespace(network: string): 'eip155:*' | 'solana:*' {
  if (network.startsWith('eip155:')) return 'eip155:*';
  if (network.startsWith('solana:')) return 'solana:*';
  throw new Error(`No x402 exact seller is registered for network ${network}`);
}

/**
 * Register one exact seller implementation for each network namespace in use.
 */
async function registerExactSellerSchemes(
  server: x402ResourceServer,
  offers: readonly CompiledExactX402Offer[]
): Promise<void> {
  const namespaces = new Set(
    offers.map(offer => networkNamespace(offer.network))
  );
  if (namespaces.has('eip155:*')) {
    server.register('eip155:*', new ExactEvmScheme());
  }
  if (namespaces.has('solana:*')) {
    // The SVM server pulls in Node-oriented WebSocket support. Keep it off the
    // portable root import path and load it only for Solana receivers.
    const { ExactSvmScheme } = await import('@x402/svm/exact/server');
    server.register('solana:*', new ExactSvmScheme());
  }
}

export type RegisteredSellerSchemes = {
  batchSettlement?: BatchSettlementEvmScheme;
};

/**
 * Register every seller scheme required by one route without changing offer
 * order. Batch settlement is EVM-only and one route must resolve to one
 * receiver because the upstream scheme binds its receiver at construction.
 */
export async function registerSellerSchemes(
  server: x402ResourceServer,
  offers: readonly CompiledX402Offer[],
  batchSettlement?: ResolvedBatchSettlementServerOptions
): Promise<RegisteredSellerSchemes> {
  const exactOffers = offers.filter(
    (offer): offer is CompiledExactX402Offer => offer.scheme === 'exact'
  );
  await registerExactSellerSchemes(server, exactOffers);

  const uptoOffers = offers.filter(
    (offer): offer is CompiledUptoX402Offer => offer.scheme === 'upto'
  );
  if (uptoOffers.length > 0) {
    server.register('eip155:*', new UptoEvmScheme());
  }

  const batchOffers = offers.filter(
    (offer): offer is CompiledBatchSettlementX402Offer =>
      offer.scheme === 'batch-settlement'
  );
  if (batchOffers.length === 0) return {};
  if (!batchSettlement) {
    throw new Error(
      'x402 batch-settlement requires explicit batchSettlement configuration'
    );
  }
  const receivers = new Set(
    batchOffers.map(offer => offer.payTo.toLowerCase())
  );
  if (receivers.size !== 1) {
    throw new Error(
      'x402 batch-settlement offers on one route must use one receiver'
    );
  }
  const receiver = batchOffers[0]!.payTo;
  const scheme = new BatchSettlementEvmScheme(
    receiver,
    batchSettlement.schemeConfig
  );
  server.register('eip155:*', scheme);
  return { batchSettlement: scheme };
}
