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
