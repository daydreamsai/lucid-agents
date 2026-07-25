import type { EntrypointDef } from '@lucid-agents/types/core';
import type {
  MppConfig,
  TempoSessionServerConfig,
} from '@lucid-agents/types/mpp';
import { describe, expect, it } from 'bun:test';
import { DiscoveryDocument, PaymentInfo } from 'mppx/discovery';

import { buildManifestWithMpp } from '../manifest';
import { projectMppOpenApi, resolveMppOffers } from '../openapi';

const config: MppConfig = {
  methods: [
    {
      name: 'tempo',
      implementation: 'tempo',
      config: {
        currency: '0x20c0000000000000000000000000000000000000',
        recipient: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        decimals: 6,
      },
    },
    {
      name: 'stripe',
      implementation: 'stripe',
      config: {
        secretKey: 'must-never-appear-in-discovery',
        networkId: 'stripe',
        currency: 'usd',
        decimals: 2,
      },
    },
    {
      name: 'evm',
      implementation: 'custom',
      config: {
        currency: 'USDC',
        recipient: '0xmerchant',
        decimals: 6,
        verifierSecret: 'also-must-not-appear',
      },
    },
  ],
  defaultIntent: 'charge',
};

const paid: EntrypointDef = {
  key: 'paid report',
  description: 'Generate a paid report',
  price: { invoke: '1.25', stream: '0.5' },
  handler: async () => ({ output: {} }),
  stream: async () => ({ status: 'succeeded' }),
};

describe('MPP OpenAPI projection', () => {
  it('projects base-path-aware invoke and stream operations with ordered offers', () => {
    const document = projectMppOpenApi({
      title: 'Report Agent',
      version: '1.2.3',
      basePath: '/api/agent/',
      config,
      entrypoints: [
        paid,
        {
          key: 'free',
          handler: async () => ({ output: {} }),
        },
        {
          key: 'inactive',
          price: '1',
        },
      ],
    });

    expect(() => DiscoveryDocument.parse(document)).not.toThrow();
    expect(Object.keys(document.paths)).toEqual([
      '/api/agent/entrypoints/paid%20report/invoke',
      '/api/agent/entrypoints/paid%20report/stream',
      '/api/agent/entrypoints/free/invoke',
    ]);

    const invoke =
      document.paths['/api/agent/entrypoints/paid%20report/invoke']?.post;
    const stream =
      document.paths['/api/agent/entrypoints/paid%20report/stream']?.post;
    expect(PaymentInfo.parse(invoke?.['x-payment-info']).offers).toEqual([
      {
        amount: '1250000',
        currency: '0x20c0000000000000000000000000000000000000',
        description: 'Generate a paid report',
        intent: 'charge',
        method: 'tempo',
      },
      {
        amount: '125',
        currency: 'usd',
        description: 'Generate a paid report',
        intent: 'charge',
        method: 'stripe',
      },
      {
        amount: '1250000',
        currency: 'USDC',
        description: 'Generate a paid report',
        intent: 'charge',
        method: 'evm',
      },
    ]);
    expect(
      PaymentInfo.parse(stream?.['x-payment-info']).offers[0]
    ).toMatchObject({
      amount: '500000',
      method: 'tempo',
    });
    expect(
      document.paths['/api/agent/entrypoints/free/invoke']?.post?.[
        'x-payment-info'
      ]
    ).toBeUndefined();
  });

  it('derives discovery offers from entrypoint method and currency overrides', () => {
    const offers = resolveMppOffers(
      config,
      {
        ...paid,
        metadata: {
          mpp: {
            amount: '3',
            currency: 'eur',
            methods: ['stripe', 'evm'],
          },
        },
      },
      'invoke'
    );

    expect(offers).toEqual([
      {
        amount: '300',
        challengeAmount: '3',
        currency: 'eur',
        description: 'Generate a paid report',
        intent: 'charge',
        method: 'stripe',
      },
      {
        amount: '3000000',
        challengeAmount: '3',
        currency: 'eur',
        description: 'Generate a paid report',
        intent: 'charge',
        method: 'evm',
      },
    ]);
  });

  it('documents Problem Details and payment credential/receipt headers without secrets', () => {
    const document = projectMppOpenApi({
      title: 'Report Agent',
      version: '1.2.3',
      config,
      entrypoints: [paid],
    });
    const serialized = JSON.stringify(document);

    expect(document.openapi).toBe('3.1.0');
    expect(document.components.schemas).toHaveProperty('ProblemDetails');
    expect(document.components.schemas).toHaveProperty('PaymentCredential');
    expect(document.components.schemas).toHaveProperty('PaymentReceipt');
    expect(document.components.headers).toHaveProperty('WWWAuthenticate');
    expect(document.components.headers).toHaveProperty('PaymentReceipt');
    expect(serialized).not.toContain('must-never-appear-in-discovery');
    expect(serialized).not.toContain('also-must-not-appear');
    expect(serialized).not.toContain('0xmerchant');
  });

  it('keeps default OpenAPI offers aligned with Agent Card methods', () => {
    const offers = [
      ...resolveMppOffers(config, paid, 'invoke'),
      ...resolveMppOffers(config, paid, 'stream'),
    ];
    const manifest = buildManifestWithMpp(
      {
        name: 'Report Agent',
        entrypoints: {
          'paid report': {
            description: paid.description,
            streaming: true,
          },
        },
      },
      config,
      [paid]
    );
    const manifestOffers = (manifest.payments ?? []).map(value => {
      const payment = value as {
        extensions: {
          mpp: {
            amount: string | null;
            description?: string;
            method: string;
            intent: string;
            currency: string;
          };
        };
      };
      return payment.extensions.mpp;
    });

    expect(
      offers.map(({ challengeAmount: _challengeAmount, ...offer }) => offer)
    ).toEqual(manifestOffers);
  });

  it('advertises only compatible Tempo session offers with session intent', () => {
    const sessionConfig: MppConfig = {
      methods: [
        {
          name: 'tempo',
          implementation: 'tempo-session',
          config: {
            amount: '0.25',
            currency: '0x20c0000000000000000000000000000000000000',
            decimals: 6,
          } as unknown as TempoSessionServerConfig,
        },
        config.methods[0]!,
      ],
      defaultIntent: 'session',
    };
    const sessionEntrypoint: EntrypointDef = {
      ...paid,
      price: '99',
      metadata: { mpp: { intent: 'session' } },
    };
    const manifest = buildManifestWithMpp(
      {
        name: 'Session Agent',
        entrypoints: {
          'paid report': {
            description: paid.description,
            streaming: true,
          },
        },
      },
      sessionConfig,
      [sessionEntrypoint]
    );

    expect(manifest.entrypoints['paid report']?.pricing).toEqual({
      invoke: '0.25',
      stream: '0.25',
    });
    expect(manifest.entrypoints['paid report']?.payment_protocol).toBe('mpp');
    expect(manifest.payments).toHaveLength(1);
    expect(manifest.payments?.[0]).toMatchObject({
      method: 'mpp',
      network: 'mpp',
      priceModel: { default: '250000' },
      extensions: {
        mpp: {
          amount: '250000',
          currency: '0x20c0000000000000000000000000000000000000',
          description: 'Generate a paid report',
          intent: 'session',
          method: 'tempo',
        },
      },
    });
  });
});
