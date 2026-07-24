import { describe, expect, test } from 'bun:test';
import { createClient, custom, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { tempo } from '../methods';
import { resolveMppOffers } from '../openapi';
import { createInMemoryTempoSessionStore } from '../tempo-session-store';

const account = privateKeyToAccount(
  '0xac0974bec39a17e36ba6a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
);
const client = createClient({
  account,
  chain: defineChain({
    id: 42431,
    name: 'Tempo Test',
    nativeCurrency: { name: 'Tempo', symbol: 'TEMPO', decimals: 18 },
    rpcUrls: { default: { http: ['http://localhost'] } },
  }),
  transport: custom({
    async request() {
      throw new Error('unexpected RPC request');
    },
  }),
});

const baseConfig = {
  mode: 'development' as const,
  account,
  chainId: 42431,
  currency: '0x20c0000000000000000000000000000000000000' as const,
  recipient: '0x0000000000000000000000000000000000000002' as const,
  decimals: 6,
  amount: '0.001',
  unitType: 'request',
  deposit: {
    minimum: '0.001',
    suggested: '0.01',
    maximum: '1',
  },
  getClient: async () => client,
};

describe('Tempo session descriptor', () => {
  test('is explicit and preserves lifecycle configuration', () => {
    const settlementEvents: unknown[] = [];
    const descriptor = tempo.session({
      ...baseConfig,
      bootstrap: true,
      resolveChannelId: async ({ source }) =>
        source ? `channel:${source}` : undefined,
      settlementSchedule: { units: 100, intervalMs: 60_000 },
      onSettlement: event => {
        settlementEvents.push(event);
      },
    });

    expect(descriptor).toEqual({
      name: 'tempo',
      implementation: 'tempo-session',
      config: expect.objectContaining({
        amount: '0.001',
        bootstrap: true,
        unitType: 'request',
        settlementSchedule: { units: 100, intervalMs: 60_000 },
      }),
    });
  });

  test('requires durable state in production and validates deposit bounds', () => {
    expect(() =>
      tempo.session({
        ...baseConfig,
        mode: 'production',
        store: createInMemoryTempoSessionStore(),
      })
    ).toThrow('production mode requires durable');

    expect(() =>
      tempo.session({
        ...baseConfig,
        deposit: {
          minimum: '0.1',
          suggested: '0.01',
          maximum: '1',
        },
      })
    ).toThrow('minimum <= suggested <= maximum');
  });

  test('validates display amounts and session bootstrap configuration', () => {
    expect(() =>
      tempo.session({
        ...baseConfig,
        decimals: -1,
      })
    ).toThrow('decimals must be a safe integer from 0-255');

    expect(() =>
      tempo.session({
        ...baseConfig,
        amount: 'invalid',
      })
    ).toThrow('amount must be a non-negative decimal');

    expect(() =>
      tempo.session({
        ...baseConfig,
        amount: '0.0000001',
      })
    ).toThrow('amount exceeds configured currency precision');

    expect(() =>
      tempo.session({
        ...baseConfig,
        amount: '0',
      })
    ).toThrow('amount must be greater than zero');

    expect(() =>
      tempo.session({
        ...baseConfig,
        deposit: {
          minimum: '0.0001',
          suggested: '0.01',
          maximum: '1',
        },
      })
    ).toThrow('amount <= minimum');

    expect(() =>
      tempo.session({
        ...baseConfig,
        bootstrap: true,
      })
    ).toThrow('bootstrap requires a resolveChannelId callback');
  });

  test('requires positive settlement thresholds', () => {
    expect(() =>
      tempo.session({
        ...baseConfig,
        settlementSchedule: {},
      })
    ).toThrow('requires at least one threshold');

    expect(() =>
      tempo.session({
        ...baseConfig,
        settlementSchedule: { units: 0 },
      })
    ).toThrow('settlement units must be positive');

    expect(() =>
      tempo.session({
        ...baseConfig,
        settlementSchedule: { units: 1.5 },
      })
    ).toThrow('settlement units must be positive');

    expect(() =>
      tempo.session({
        ...baseConfig,
        settlementSchedule: { intervalMs: 0 },
      })
    ).toThrow('settlement intervalMs must be positive');

    expect(() =>
      tempo.session({
        ...baseConfig,
        settlementSchedule: { amount: '0' },
      })
    ).toThrow('settlement amount must be positive');

    expect(
      tempo.session({
        ...baseConfig,
        settlementSchedule: { amount: '0.000001' },
      })
    ).toMatchObject({
      implementation: 'tempo-session',
    });
  });

  test('coexists with Tempo charge and selects the session unit amount', () => {
    const config = {
      methods: [
        tempo.server({
          currency: baseConfig.currency,
          recipient: baseConfig.recipient,
          decimals: baseConfig.decimals,
        }),
        tempo.session(baseConfig),
      ],
      defaultIntent: 'charge' as const,
    };

    expect(
      resolveMppOffers(
        config,
        {
          key: 'session',
          price: '99',
          metadata: { mpp: { intent: 'session' } },
          handler: async () => ({ output: null }),
        },
        'invoke'
      )
    ).toMatchObject([
      {
        method: 'tempo',
        intent: 'session',
        challengeAmount: '0.001',
        amount: '1000',
      },
    ]);
    expect(
      resolveMppOffers(
        config,
        {
          key: 'charge',
          price: '2',
          handler: async () => ({ output: null }),
        },
        'invoke'
      )
    ).toMatchObject([
      {
        method: 'tempo',
        intent: 'charge',
        challengeAmount: '2',
        amount: '2000000',
      },
    ]);
  });
});
