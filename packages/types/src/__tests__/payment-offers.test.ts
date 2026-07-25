import { describe, expect, test } from 'bun:test';

import type {
  EntrypointPaymentSettlement,
  EntrypointX402Config,
  X402Offer,
} from '../payments';

describe('x402 public offer contracts', () => {
  test('represent exact, upto, and batch-settlement offers without SDK types', () => {
    const offers: readonly X402Offer[] = [
      {
        scheme: 'exact',
        network: 'eip155:8453',
        price: '0.01',
        payTo: '0x0000000000000000000000000000000000000001',
      },
      {
        scheme: 'upto',
        network: 'eip155:8453',
        maximum: {
          amount: '10000',
          asset: '0x0000000000000000000000000000000000000002',
        },
        payTo: '0x0000000000000000000000000000000000000001',
      },
      {
        scheme: 'batch-settlement',
        network: 'eip155:8453',
        maximum: '1.00',
        payTo: '0x0000000000000000000000000000000000000001',
        extensions: [{ key: 'payment-identifier' }],
      },
    ];
    const config: EntrypointX402Config = { offers };

    expect(config.offers.map(offer => offer.scheme)).toEqual([
      'exact',
      'upto',
      'batch-settlement',
    ]);
  });

  test('represents actual settlement independently of a response body', () => {
    const settlement: EntrypointPaymentSettlement = {
      actualAmount: '0.0042',
    };

    expect(settlement.actualAmount).toBe('0.0042');
  });
});
