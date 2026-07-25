import type { EntrypointDef } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import { describe, expect, it } from 'bun:test';

import { compileX402Extensions, compileX402Offers } from '../x402-offers';

const config: PaymentsConfig = {
  facilitatorUrl: 'https://facilitator.example',
  network: 'eip155:84532',
  payTo: '0x0000000000000000000000000000000000000001',
};

function explicitEntrypoint(
  offers: NonNullable<EntrypointDef['x402']>['offers']
): EntrypointDef {
  return {
    key: 'validated-offers',
    paymentProtocol: 'x402',
    x402: { offers },
  };
}

describe('x402 offer validation', () => {
  it('rejects unsafe facilitator URLs', () => {
    const exact = (facilitatorUrl: string): EntrypointDef =>
      explicitEntrypoint([
        {
          scheme: 'exact',
          network: 'eip155:84532',
          price: '1',
          facilitatorUrl,
        },
      ]);

    expect(() =>
      compileX402Offers(exact('not a URL'), config, 'invoke')
    ).toThrow('must be a valid HTTP(S) URL');
    expect(() =>
      compileX402Offers(exact('ftp://facilitator.example'), config, 'invoke')
    ).toThrow('must use HTTP(S)');
    expect(() =>
      compileX402Offers(
        exact('https://user:secret@facilitator.example'),
        config,
        'invoke'
      )
    ).toThrow('must not contain credentials');
  });

  it('requires EVM networks and one receiver for metered offers', () => {
    const solanaNetwork = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1' as const;

    expect(() =>
      compileX402Offers(
        explicitEntrypoint([
          {
            scheme: 'upto',
            network: solanaNetwork as never,
            maximum: '1',
          },
        ]),
        config,
        'invoke'
      )
    ).toThrow('upto requires an EVM network');
    expect(() =>
      compileX402Offers(
        explicitEntrypoint([
          {
            scheme: 'batch-settlement',
            network: solanaNetwork as never,
            maximum: '1',
          },
        ]),
        config,
        'invoke'
      )
    ).toThrow('batch-settlement requires an EVM network');
    expect(() =>
      compileX402Offers(
        explicitEntrypoint([
          {
            scheme: 'batch-settlement',
            network: 'eip155:84532',
            maximum: '1',
            payTo: '0x0000000000000000000000000000000000000001',
          },
          {
            scheme: 'batch-settlement',
            network: 'eip155:84532',
            maximum: '2',
            payTo: '0x0000000000000000000000000000000000000002',
          },
        ]),
        config,
        'invoke'
      )
    ).toThrow('must use one receiver');
  });

  it('rejects empty and conflicting extension declarations', () => {
    const compiled = compileX402Offers(
      explicitEntrypoint([
        {
          scheme: 'exact',
          network: 'eip155:84532',
          price: '1',
          extensions: [{ key: 'receipt', info: { version: 1 } }],
        },
        {
          scheme: 'exact',
          network: 'eip155:84532',
          price: '2',
          extensions: [{ key: 'receipt', info: { version: 2 } }],
        },
      ]),
      config,
      'invoke'
    )!;

    expect(() =>
      compileX402Extensions(
        [
          {
            ...compiled.offers[0]!,
            extensions: [{ key: ' ', info: {} }],
          },
        ],
        'validated-offers'
      )
    ).toThrow('extension key must be non-empty');
    expect(() =>
      compileX402Extensions(compiled.offers, 'validated-offers')
    ).toThrow('Conflicting x402 extension "receipt"');
  });
});
