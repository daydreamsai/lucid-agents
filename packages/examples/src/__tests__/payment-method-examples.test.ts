import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createInMemoryTaskStore,
  type InMemoryTaskStoreOptions,
} from '@lucid-agents/a2a';
import { decodePaymentRequiredHeader } from '@lucid-agents/payments';
import type { TaskStore } from '@lucid-agents/types/a2a';
import { afterEach, describe, expect, it } from 'bun:test';
import { Challenge } from 'mppx';
import { createClient, custom, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { paymentMethodCoverage } from '../payment-methods/coverage';
import {
  createMppChargeMethodsExample,
  createTempoSessionExample,
} from '../payment-methods/mpp';
import {
  createX402PaymentMethodsExample,
  createX402StripeDestinationExample,
} from '../payment-methods/x402';

const originalFetch = globalThis.fetch;
const evmNetwork = 'eip155:84532';
const solanaNetwork = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1' as const;
const evmAsset = '0x0000000000000000000000000000000000000010';
const solanaAsset = 'So11111111111111111111111111111111111111112';
const taskAccessToken = 'payment-example-task-access-token';

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function supported(network: string, asset: string, scheme: string) {
  return Response.json({
    kinds: [
      {
        x402Version: 2,
        scheme,
        network,
        asset: {
          address: asset,
          decimals: 6,
          ...(scheme === 'batch-settlement'
            ? { eip712: { name: 'USDC', version: '2' } }
            : {}),
        },
        extra:
          scheme === 'upto'
            ? {
                facilitatorAddress:
                  '0x00000000000000000000000000000000000000f1',
              }
            : scheme === 'batch-settlement'
              ? {
                  receiverAuthorizer:
                    '0x00000000000000000000000000000000000000f2',
                }
              : {},
      },
    ],
    extensions: [],
    signers: {},
  });
}

function paymentRequired(response: Response) {
  const decoded = decodePaymentRequiredHeader(
    response.headers.get('PAYMENT-REQUIRED')
  );
  if (!decoded) throw new Error('Expected PAYMENT-REQUIRED');
  return decoded;
}

function createDurableTestTaskStore(
  options: InMemoryTaskStoreOptions = {}
): TaskStore {
  return {
    ...createInMemoryTaskStore(options),
    // Test-only facade: production examples must inject genuinely durable IO.
    durability: 'durable',
  };
}

describe('payment method examples', () => {
  it('maps every supported payment method to example code and executable proof', () => {
    const matrix = JSON.parse(
      readFileSync(
        new URL(
          '../../../../docs/payment-support-matrix.json',
          import.meta.url
        ),
        'utf8'
      )
    ) as { rows: Array<{ id: string }> };
    expect(Object.keys(paymentMethodCoverage).sort()).toEqual(
      matrix.rows.map(row => row.id).sort()
    );
    for (const coverage of Object.values(paymentMethodCoverage)) {
      expect(existsSync(resolve(coverage.example))).toBe(true);
      expect(existsSync(resolve(coverage.proof))).toBe(true);
      expect(existsSync(resolve(coverage.tutorial))).toBe(true);
      const tutorial = readFileSync(resolve(coverage.tutorial), 'utf8');
      expect(tutorial).toContain(coverage.example);
      expect(tutorial).toContain(coverage.proof);
    }
  });

  it('x402 example publishes exact EVM/Solana, upto, batch, and SIWX routes', async () => {
    globalThis.fetch = (async input => {
      const url = new URL(new Request(input).url);
      if (!url.pathname.endsWith('/supported')) {
        return Response.json({ error: 'unexpected request' }, { status: 500 });
      }
      if (url.hostname === 'solana-facilitator.example') {
        return supported(solanaNetwork, solanaAsset, 'exact');
      }
      const scheme = url.hostname.startsWith('upto-')
        ? 'upto'
        : url.hostname.startsWith('batch-')
          ? 'batch-settlement'
          : 'exact';
      return supported(evmNetwork, evmAsset, scheme);
    }) as typeof fetch;

    const example = await createX402PaymentMethodsExample({
      evm: {
        network: evmNetwork,
        payTo: '0x1234567890abcdef1234567890abcdef12345678',
        asset: evmAsset,
        exactFacilitatorUrl: 'https://exact-facilitator.example',
        uptoFacilitatorUrl: 'https://upto-facilitator.example',
        batchFacilitatorUrl: 'https://batch-facilitator.example',
      },
      solana: {
        network: solanaNetwork,
        payTo: '7YttLkHDo2p6wM6o1HqCrM3k8wM4n1Rk2pQa8vZ6wabc',
        asset: solanaAsset,
        facilitatorUrl: 'https://solana-facilitator.example',
      },
      siwxOrigin: 'https://agent.example',
      batchSettlement: { mode: 'development' },
      taskStore: createDurableTestTaskStore(),
    });

    try {
      const openApiResponse = await example.app.fetch(
        new Request('http://localhost/openapi.json')
      );
      const openApi = (await openApiResponse.json()) as {
        paths: Record<
          string,
          {
            post?: {
              'x-x402-payment'?: {
                offers: Array<{ scheme: string; network: string }>;
              };
            };
          }
        >;
      };
      expect(
        openApi.paths['/entrypoints/exact-report/invoke']?.post?.[
          'x-x402-payment'
        ]?.offers.map(offer => [offer.scheme, offer.network])
      ).toEqual([
        ['exact', evmNetwork],
        ['exact', solanaNetwork],
      ]);
      expect(
        openApi.paths['/entrypoints/metered-report/invoke']?.post?.[
          'x-x402-payment'
        ]?.offers[0]?.scheme
      ).toBe('upto');
      expect(
        openApi.paths['/entrypoints/batch-report/invoke']?.post?.[
          'x-x402-payment'
        ]?.offers[0]?.scheme
      ).toBe('batch-settlement');
      expect(
        openApi.paths['/entrypoints/exact-report/stream']?.post?.[
          'x-x402-payment'
        ]?.offers
      ).toHaveLength(2);
      expect(
        openApi.paths['/entrypoints/batch-report/stream']?.post?.[
          'x-x402-payment'
        ]?.offers[0]?.scheme
      ).toBe('batch-settlement');
      expect(
        openApi.paths['/entrypoints/metered-report/stream']
      ).toBeUndefined();

      const call = (key: string, operation: 'invoke' | 'stream' = 'invoke') =>
        example.app.fetch(
          new Request(`http://localhost/entrypoints/${key}/${operation}`, {
            method: 'POST',
            headers: {
              Accept:
                operation === 'stream'
                  ? 'text/event-stream'
                  : 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ input: { units: 2, prompt: 'hello' } }),
          })
        );

      const exact = await call('exact-report');
      expect(exact.status).toBe(402);
      expect(
        paymentRequired(exact).accepts.map(offer => [
          offer.scheme,
          offer.network,
        ])
      ).toEqual([
        ['exact', evmNetwork],
        ['exact', solanaNetwork],
      ]);

      const upto = await call('metered-report');
      expect(upto.status).toBe(402);
      expect(paymentRequired(upto).accepts[0]?.scheme).toBe('upto');

      const batch = await call('batch-report');
      if (batch.status !== 402) {
        throw new Error(
          `batch-report challenge failed: ${batch.status} ${await batch.text()}`
        );
      }
      expect(batch.status).toBe(402);
      expect(paymentRequired(batch).accepts[0]?.scheme).toBe(
        'batch-settlement'
      );

      for (const [key, expectedScheme] of [
        ['exact-report', 'exact'],
        ['batch-report', 'batch-settlement'],
      ] as const) {
        const stream = await call(key, 'stream');
        expect(stream.status).toBe(402);
        expect(paymentRequired(stream).accepts[0]?.scheme).toBe(expectedScheme);

        const task = await example.app.fetch(
          new Request('http://localhost/tasks', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Task-Access-Token': taskAccessToken,
            },
            body: JSON.stringify({
              skillId: key,
              message: {
                role: 'user',
                content: { text: JSON.stringify({ prompt: 'hello' }) },
              },
            }),
          })
        );
        expect(task.status).toBe(402);
        expect(paymentRequired(task).accepts[0]?.scheme).toBe(expectedScheme);
      }

      const profile = await call('member-profile');
      expect(profile.status).toBe(401);
      expect(
        paymentRequired(profile).extensions?.['sign-in-with-x']
      ).toBeDefined();
    } finally {
      await example.close();
    }
  });

  it('x402 Stripe destination example advertises dynamic payee resolution', async () => {
    const example = await createX402StripeDestinationExample({
      secretKey: 'sk_test_example',
      facilitatorUrl: 'https://facilitator.example',
      network: 'eip155:8453',
    });

    try {
      const response = await example.app.fetch(
        new Request('http://localhost/.well-known/agent-card.json')
      );
      const card = (await response.json()) as {
        payments?: Array<{
          method?: string;
          payee?: string;
          extensions?: { x402?: { payeeMode?: string } };
        }>;
      };
      expect(card.payments?.[0]).toMatchObject({
        method: 'x402',
        extensions: { x402: { payeeMode: 'dynamic' } },
      });
      expect(card.payments?.[0]?.payee).toBeUndefined();
    } finally {
      await example.close();
    }
  });

  it('MPP charge example publishes Tempo, Stripe, EVM, custom, and Lightning methods', async () => {
    const example = await createMppChargeMethodsExample({
      tempo: {
        currency: '0x20c0000000000000000000000000000000000000',
        recipient: '0x0000000000000000000000000000000000000001',
      },
      stripe: {
        secretKey: 'sk_test_example',
        networkId: 'stripe-business-network-test',
      },
      evm: {
        chainId: 84532,
        currency: '0x0000000000000000000000000000000000000010',
        recipient: '0x0000000000000000000000000000000000000002',
        decimals: 6,
        authorization: { name: 'USD Coin', version: '2' },
        settlement: {
          type: 'custom',
          settle: async () => ({ reference: 'example-settlement' }),
        },
      },
      custom: {
        name: 'acme-pay',
        config: { merchantId: 'merchant-42' },
      },
      lightning: {
        nodeUrl: 'https://lightning.example',
      },
      verifyCustomCredential: async ({ credential }) => ({
        valid: credential.payload.settled === true,
        ...(credential.payload.settled === true
          ? {
              receipt: 'example-custom-receipt',
              payer: credential.source,
              network: 'example:test',
            }
          : { reason: 'unsettled example credential' }),
      }),
      secretKey: 'mpp-charge-methods-example-secret-key',
      taskStore: createDurableTestTaskStore(),
    });

    try {
      for (const [key, method] of [
        ['tempo-charge', 'tempo'],
        ['stripe-charge', 'stripe'],
        ['evm-charge', 'evm'],
        ['custom-charge', 'acme-pay'],
        ['lightning-custom-charge', 'lightning'],
      ] as const) {
        const response = await example.app.fetch(
          new Request(`http://localhost/entrypoints/${key}/invoke`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: { prompt: 'hello' } }),
          })
        );
        expect(response.status).toBe(402);
        expect(Challenge.fromResponse(response).method).toBe(method);
        expect(Challenge.fromResponse(response).intent).toBe('charge');

        const stream = await example.app.fetch(
          new Request(`http://localhost/entrypoints/${key}/stream`, {
            method: 'POST',
            headers: {
              Accept: 'text/event-stream',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ input: { prompt: 'hello' } }),
          })
        );
        expect(stream.status).toBe(402);
        expect(Challenge.fromResponse(stream).method).toBe(method);

        const task = await example.app.fetch(
          new Request('http://localhost/tasks', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Task-Access-Token': taskAccessToken,
            },
            body: JSON.stringify({
              skillId: key,
              message: {
                role: 'user',
                content: { text: JSON.stringify({ prompt: 'hello' }) },
              },
            }),
          })
        );
        expect(task.status).toBe(402);
        expect(Challenge.fromResponse(task).method).toBe(method);
      }

      const negotiated = await example.app.fetch(
        new Request('http://localhost/entrypoints/charge-any/invoke', {
          method: 'POST',
          headers: {
            'Accept-Payment': 'evm/charge',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ input: { prompt: 'hello' } }),
        })
      );
      expect(negotiated.status).toBe(402);
      expect(Challenge.fromResponse(negotiated).method).toBe('evm');
    } finally {
      await example.close();
    }
  });

  it('Tempo session example exposes distinct invoke and metered SSE operations', async () => {
    const account = privateKeyToAccount(
      '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    );
    const chainId = 42431;
    const chain = defineChain({
      id: chainId,
      name: 'Tempo Example',
      nativeCurrency: { name: 'Tempo', symbol: 'TEMPO', decimals: 18 },
      rpcUrls: { default: { http: ['http://localhost'] } },
    });
    const client = createClient({
      account,
      chain,
      transport: custom({
        async request() {
          throw new Error('Challenge-only example does not call Tempo RPC');
        },
      }),
    });
    const example = await createTempoSessionExample({
      session: {
        mode: 'development',
        account,
        chainId,
        currency: '0x20c0000000000000000000000000000000000000',
        recipient: account.address,
        decimals: 6,
        amount: '0.001',
        unitType: 'chunk',
        deposit: {
          minimum: '0.001',
          suggested: '0.01',
          maximum: '0.10',
        },
        getClient: () => client,
      },
      secretKey: 'tempo-session-example-secret-key',
    });

    try {
      for (const operation of ['invoke', 'stream'] as const) {
        const response = await example.app.fetch(
          new Request(
            `http://localhost/entrypoints/tempo-session-report/${operation}`,
            {
              method: 'POST',
              headers: {
                Accept:
                  operation === 'stream'
                    ? 'text/event-stream'
                    : 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ input: { prompt: 'hello' } }),
            }
          )
        );
        expect(response.status).toBe(402);
        expect(Challenge.fromResponse(response)).toMatchObject({
          method: 'tempo',
          intent: 'session',
        });
      }

      const task = await example.app.fetch(
        new Request('http://localhost/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skillId: 'tempo-session-report',
            message: {
              role: 'user',
              content: { text: JSON.stringify({ prompt: 'hello' }) },
            },
          }),
        })
      );
      expect(task.status).toBe(404);
    } finally {
      await example.close();
    }
  });
});
