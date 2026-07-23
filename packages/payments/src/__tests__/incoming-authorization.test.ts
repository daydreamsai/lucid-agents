import type { EntrypointDef } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import type { SIWxStorage } from '@lucid-agents/types/siwx';
import { describe, expect, it } from 'bun:test';
import { decodePaymentRequiredHeader } from '@x402/core/http';
import { SIGN_IN_WITH_X } from '@x402/extensions/sign-in-with-x';

import { createInMemoryPaymentStorage } from '../in-memory-payment-storage';
import type { PaymentStorage } from '../payment-storage';
import { createPaymentsRuntime } from '../payments';

const baseConfig: PaymentsConfig = {
  facilitatorUrl: 'https://facilitator.example.com',
  network: 'eip155:84532',
  payTo: '0x1234567890abcdef1234567890abcdef12345678',
};

const entrypoint: EntrypointDef = {
  key: 'paid',
  price: '1',
  paymentProtocol: 'mpp',
};

function mppRequest(origin?: string): Request {
  return new Request('https://agent.example.com/entrypoints/paid/invoke', {
    method: 'POST',
    headers: origin ? { Origin: origin } : undefined,
  });
}

function x402PaymentSignature(
  response: Response,
  payer: string,
  claimedPayer?: string
): string {
  const required = response.headers.get('PAYMENT-REQUIRED');
  if (!required) throw new Error('Missing PAYMENT-REQUIRED header');
  const challenge = JSON.parse(
    Buffer.from(required, 'base64').toString('utf8')
  ) as {
    x402Version: number;
    resource: Record<string, unknown>;
    accepts: Array<Record<string, unknown>>;
  };
  return Buffer.from(
    JSON.stringify({
      x402Version: challenge.x402Version,
      resource: challenge.resource,
      accepted: challenge.accepts[0],
      ...(claimedPayer ? { payer: claimedPayer } : {}),
      payload: {
        signature: 'test-signature',
        authorization: { from: payer },
      },
    })
  ).toString('base64');
}

async function withFacilitator<T>(
  action: () => Promise<T>,
  options: {
    failSupported?: () => boolean;
    failSettle?: () => boolean;
    failVerify?: () => boolean;
    onSupported?: () => void;
    network?: string;
    networkForFacilitator?: (url: URL) => string;
  } = {}
): Promise<T> {
  const network = options.network ?? 'eip155:84532';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const rawUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const path = new URL(rawUrl).pathname;
    if (path.endsWith('/supported')) {
      options.onSupported?.();
      if (options.failSupported?.()) throw new Error('facilitator unavailable');
      const supportedNetwork =
        options.networkForFacilitator?.(new URL(rawUrl)) ?? network;
      return Response.json({
        kinds: [
          {
            x402Version: 2,
            scheme: 'exact',
            network: supportedNetwork,
            extra: {
              feePayer: '11111111111111111111111111111111',
            },
            asset: {
              address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
              decimals: 6,
              eip712: { name: 'USDC', version: '2' },
            },
          },
        ],
      });
    }
    if (path.endsWith('/verify')) {
      if (options.failVerify?.()) {
        throw new Error('provider-secret-should-not-be-public');
      }
      return Response.json({
        isValid: true,
        payer: '0x1234567890123456789012345678901234567890',
      });
    }
    if (path.endsWith('/settle')) {
      if (options.failSettle?.()) {
        throw new Error('settlement-secret-should-not-be-public');
      }
      return Response.json({
        success: true,
        payer: '0x1234567890123456789012345678901234567890',
        transaction: '0xtest',
        network,
      });
    }
    return Response.json({ error: 'unexpected request' }, { status: 500 });
  }) as typeof globalThis.fetch;
  try {
    return await action();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe('verified incoming payment authorization', () => {
  it('fails closed when USD policies cannot value a token-denominated x402 offer', async () => {
    const runtime = createPaymentsRuntime({
      ...baseConfig,
      policyGroups: [
        {
          name: 'usd-budget',
          incomingLimits: { global: { maxTotalUsd: 1 } },
        },
      ],
    })!;
    const tokenPricedEntrypoint: EntrypointDef = {
      key: 'token-priced',
      paymentProtocol: 'x402',
      x402: {
        offers: [
          {
            scheme: 'exact',
            network: 'eip155:84532',
            price: {
              amount: '1000',
              asset: '0x0000000000000000000000000000000000000001',
            },
          },
        ],
      },
    };

    const authorization = await runtime.authorize(
      new Request('https://agent.example.com/entrypoints/token-priced/invoke', {
        method: 'POST',
      }),
      tokenPricedEntrypoint,
      'invoke'
    );

    expect(authorization.authorized).toBe(false);
    if (authorization.authorized) throw new Error('Expected rejection');
    expect(authorization.response.status).toBe(503);
    expect(await authorization.response.json()).toEqual({
      error: {
        code: 'payment_configuration_error',
        message:
          'Incoming USD payment policies require explicitly valued offers; token-denominated x402 amounts have no trusted USD valuation.',
      },
    });
    await runtime.close();
  });

  it('serves and settles x402 challenges through the Fetch authorizer', async () => {
    await withFacilitator(async () => {
      const payer = '0x1234567890123456789012345678901234567890';
      const runtime = createPaymentsRuntime({
        ...baseConfig,
        facilitatorAuth: 'facilitator-token',
      })!;
      const x402Entrypoint: EntrypointDef = {
        key: 'paid-x402',
        description: 'Paid x402 entrypoint',
        price: '0.001',
        paymentProtocol: 'x402',
      };
      const makeRequest = (payment?: string) =>
        new Request(
          'https://agent.example.com/entrypoints/paid-x402/invoke?tag=one&tag=two&single=yes',
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'User-Agent': 'lucid-test',
              ...(payment ? { 'PAYMENT-SIGNATURE': payment } : {}),
            },
          }
        );

      const challenge = await runtime.authorize(
        makeRequest(),
        x402Entrypoint,
        'invoke'
      );
      expect(challenge.authorized).toBe(false);
      if (challenge.authorized) throw new Error('Expected x402 challenge');
      expect(challenge.response.status).toBe(402);
      expect(challenge.response.headers.get('content-type')).toContain(
        'application/json'
      );

      const cachedChallenge = await runtime.authorize(
        makeRequest(),
        x402Entrypoint,
        'invoke'
      );
      expect(cachedChallenge.authorized).toBe(false);

      const signature = x402PaymentSignature(challenge.response, payer);
      const authorization = await runtime.authorize(
        makeRequest(signature),
        x402Entrypoint,
        'invoke'
      );
      expect(authorization.authorized).toBe(true);
      if (!authorization.authorized) throw new Error('Expected paid request');
      expect(authorization.subject).toBe(`payment:eip155:84532:${payer}`);
      const admission = await authorization.admit();
      if (!admission.admitted) throw new Error('Expected paid admission');
      const response = await admission.finalize(
        new Response('settled', {
          headers: { 'X-Application': 'preserved' },
        })
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Application')).toBe('preserved');
      expect(response.headers.get('PAYMENT-RESPONSE')).toBeTruthy();
      const recovered = admission.recoverCommittedResponse?.(
        Response.json({ taskId: 'durable-task' })
      );
      expect(recovered?.headers.get('PAYMENT-RESPONSE')).toBe(
        response.headers.get('PAYMENT-RESPONSE')
      );
      await runtime.close();
    });
  });

  it('serves multiple exact offers in one challenge across facilitators', async () => {
    const evmNetwork = 'eip155:84532';
    const svmNetwork = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
    await withFacilitator(
      async () => {
        const runtime = createPaymentsRuntime(baseConfig)!;
        const authorization = await runtime.authorize(
          new Request('https://agent.example.com/entrypoints/multi/invoke', {
            method: 'POST',
          }),
          {
            key: 'multi',
            paymentProtocol: 'x402',
            x402: {
              offers: [
                {
                  scheme: 'exact',
                  network: evmNetwork,
                  price: {
                    amount: '1000',
                    asset: '0x0000000000000000000000000000000000000010',
                  },
                  payTo: '0x0000000000000000000000000000000000000020',
                  facilitatorUrl: 'https://evm-facilitator.example',
                },
                {
                  scheme: 'exact',
                  network: svmNetwork,
                  price: {
                    amount: '2000',
                    asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                  },
                  payTo: '11111111111111111111111111111111',
                  facilitatorUrl: 'https://svm-facilitator.example',
                },
              ],
            },
          },
          'invoke'
        );

        expect(authorization.authorized).toBe(false);
        if (authorization.authorized) throw new Error('Expected challenge');
        expect(authorization.response.status).toBe(402);
        const required = authorization.response.headers.get('PAYMENT-REQUIRED');
        if (!required) throw new Error('Missing PAYMENT-REQUIRED header');
        const challenge = JSON.parse(
          Buffer.from(required, 'base64').toString('utf8')
        ) as {
          accepts: Array<{
            scheme: string;
            network: string;
            amount: string;
            asset: string;
            payTo: string;
          }>;
        };
        expect(challenge.accepts).toEqual([
          expect.objectContaining({
            scheme: 'exact',
            network: evmNetwork,
            amount: '1000',
            asset: '0x0000000000000000000000000000000000000010',
            payTo: '0x0000000000000000000000000000000000000020',
          }),
          expect.objectContaining({
            scheme: 'exact',
            network: svmNetwork,
            amount: '2000',
            asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            payTo: '11111111111111111111111111111111',
          }),
        ]);
        await runtime.close();
      },
      {
        networkForFacilitator: url =>
          url.hostname === 'svm-facilitator.example' ? svmNetwork : evmNetwork,
      }
    );
  });

  it('serves exact SVM challenges through the Fetch authorizer', async () => {
    const network = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
    await withFacilitator(
      async () => {
        const runtime = createPaymentsRuntime({
          ...baseConfig,
          network,
          payTo: '11111111111111111111111111111111',
        })!;
        const authorization = await runtime.authorize(
          new Request('https://agent.example.com/entrypoints/svm/invoke', {
            method: 'POST',
          }),
          {
            key: 'svm',
            price: '0.001',
            paymentProtocol: 'x402',
          },
          'invoke'
        );

        expect(authorization.authorized).toBe(false);
        if (authorization.authorized) throw new Error('Expected challenge');
        expect(authorization.response.status).toBe(402);
        const required = authorization.response.headers.get('PAYMENT-REQUIRED');
        if (!required) throw new Error('Missing PAYMENT-REQUIRED header');
        const challenge = JSON.parse(
          Buffer.from(required, 'base64').toString('utf8')
        ) as {
          accepts: Array<{
            scheme: string;
            network: string;
            extra?: Record<string, unknown>;
          }>;
        };
        expect(challenge.accepts).toEqual([
          expect.objectContaining({
            scheme: 'exact',
            network,
            extra: expect.objectContaining({
              feePayer: '11111111111111111111111111111111',
            }),
          }),
        ]);
        await runtime.close();
      },
      { network }
    );
  });

  it('rejects a facilitator that does not support the configured exact network', async () => {
    await withFacilitator(
      async () => {
        const runtime = createPaymentsRuntime(baseConfig)!;
        const authorization = await runtime.authorize(
          new Request(
            'https://agent.example.com/entrypoints/unsupported/invoke',
            {
              method: 'POST',
            }
          ),
          {
            key: 'unsupported',
            price: '0.001',
            paymentProtocol: 'x402',
          },
          'invoke'
        );

        expect(authorization.authorized).toBe(false);
        if (authorization.authorized) throw new Error('Expected rejection');
        expect(authorization.response.status).toBe(503);
        expect(await authorization.response.json()).toEqual({
          error: {
            code: 'payment_configuration_error',
            message:
              'Configured facilitator does not support x402 v2 exact payments on eip155:84532.',
          },
        });
        await runtime.close();
      },
      { network: 'eip155:8453' }
    );
  });

  it('reports every unsupported offer in declaration order', async () => {
    await withFacilitator(
      async () => {
        const runtime = createPaymentsRuntime(baseConfig)!;
        const authorization = await runtime.authorize(
          new Request(
            'https://agent.example.com/entrypoints/unsupported/invoke',
            {
              method: 'POST',
            }
          ),
          {
            key: 'unsupported-many',
            paymentProtocol: 'x402',
            x402: {
              offers: [
                {
                  scheme: 'exact',
                  network: 'eip155:84532',
                  price: '0.001',
                },
                {
                  scheme: 'exact',
                  network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
                  price: '0.002',
                },
              ],
            },
          },
          'invoke'
        );

        expect(authorization.authorized).toBe(false);
        if (authorization.authorized) throw new Error('Expected rejection');
        expect(authorization.response.status).toBe(503);
        expect(await authorization.response.json()).toEqual({
          error: {
            code: 'payment_configuration_error',
            message:
              'Configured x402 facilitators do not support their declared offers: ' +
              'exact on eip155:84532; ' +
              'exact on solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1.',
          },
        });
        await runtime.close();
      },
      { network: 'eip155:8453' }
    );
  });

  it('does not let one facilitator satisfy another facilitator declaration', async () => {
    await withFacilitator(
      async () => {
        const runtime = createPaymentsRuntime(baseConfig)!;
        const authorization = await runtime.authorize(
          new Request('https://agent.example.com/entrypoints/crossed/invoke', {
            method: 'POST',
          }),
          {
            key: 'crossed',
            paymentProtocol: 'x402',
            x402: {
              offers: [
                {
                  scheme: 'exact',
                  network: 'eip155:84532',
                  price: '0.001',
                  facilitatorUrl: 'https://facilitator-a.example',
                },
                {
                  scheme: 'exact',
                  network: 'eip155:8453',
                  price: '0.002',
                  facilitatorUrl: 'https://facilitator-b.example',
                },
              ],
            },
          },
          'invoke'
        );

        expect(authorization.authorized).toBe(false);
        if (authorization.authorized) throw new Error('Expected rejection');
        expect(authorization.response.status).toBe(503);
        expect(await authorization.response.json()).toEqual({
          error: {
            code: 'payment_configuration_error',
            message:
              'Configured x402 facilitators do not support their declared offers: ' +
              'exact on eip155:84532; ' +
              'exact on eip155:8453.',
          },
        });
        await runtime.close();
      },
      {
        networkForFacilitator: url =>
          url.hostname === 'facilitator-a.example'
            ? 'eip155:8453'
            : 'eip155:84532',
      }
    );
  });

  it('uses the facilitator-verified payer for sender policies', async () => {
    await withFacilitator(async () => {
      const verifiedPayer = '0x1234567890123456789012345678901234567890';
      const claimedPayer = '0x9999999999999999999999999999999999999999';
      const runtime = createPaymentsRuntime({
        ...baseConfig,
        policyGroups: [
          {
            name: 'verified-sender-only',
            allowedSenders: [claimedPayer],
          },
        ],
      })!;
      const paid: EntrypointDef = {
        key: 'verified-payer',
        price: '0.001',
        paymentProtocol: 'x402',
      };
      const request = (payment?: string) =>
        new Request('https://agent.example.com/verified-payer', {
          method: 'POST',
          headers: payment ? { 'PAYMENT-SIGNATURE': payment } : undefined,
        });

      const challenge = await runtime.authorize(request(), paid, 'invoke');
      if (challenge.authorized) throw new Error('Expected x402 challenge');
      const signature = x402PaymentSignature(
        challenge.response,
        verifiedPayer,
        claimedPayer
      );
      const authorization = await runtime.authorize(
        request(signature),
        paid,
        'invoke'
      );

      expect(authorization.authorized).toBe(true);
      if (!authorization.authorized) throw new Error('Expected verification');
      expect(authorization.subject).toBe(
        `payment:eip155:84532:${verifiedPayer}`
      );
      const admission = await authorization.admit();
      expect(admission.admitted).toBe(false);
      if (admission.admitted) throw new Error('Expected sender rejection');
      expect(admission.response.status).toBe(403);
      await runtime.close();
    });
  });

  it('uses the verified x402 requirement network for identity scoping', async () => {
    const network = 'eip155:8453';
    await withFacilitator(
      async () => {
        const payer = '0x1234567890123456789012345678901234567890';
        const runtime = createPaymentsRuntime(baseConfig)!;
        const paid: EntrypointDef = {
          key: 'network-override',
          price: '0.001',
          paymentProtocol: 'x402',
          network,
        };
        const request = (payment?: string) =>
          new Request('https://agent.example.com/network-override', {
            method: 'POST',
            headers: payment ? { 'PAYMENT-SIGNATURE': payment } : undefined,
          });

        const challenge = await runtime.authorize(request(), paid, 'invoke');
        if (challenge.authorized) throw new Error('Expected x402 challenge');
        const signature = x402PaymentSignature(challenge.response, payer);
        const authorization = await runtime.authorize(
          request(signature),
          paid,
          'invoke'
        );

        expect(authorization.authorized).toBe(true);
        if (!authorization.authorized) throw new Error('Expected verification');
        expect(authorization.subject).toBe(`payment:${network}:${payer}`);
        await runtime.close();
      },
      { network }
    );
  });

  it('adds SIWX declarations to unpaid x402 challenges', async () => {
    await withFacilitator(async () => {
      const runtime = createPaymentsRuntime({
        ...baseConfig,
        siwx: {
          enabled: true,
          origin: 'https://public.agent.example.com',
        },
      })!;
      const authorization = await runtime.authorize(
        new Request('http://internal-service:8787/entrypoints/paid/stream', {
          method: 'POST',
          headers: {
            Accept: 'text/html',
            Forwarded: 'host=spoofed.example.com;proto=https',
            'X-Forwarded-Host': 'also-spoofed.example.com',
          },
        }),
        {
          key: 'paid',
          price: { stream: '0.001' },
          paymentProtocol: 'x402',
          siwx: { enabled: true, statement: 'Sign in to stream' },
        },
        'stream'
      );

      expect(authorization.authorized).toBe(false);
      if (authorization.authorized) throw new Error('Expected challenge');
      expect(authorization.response.status).toBe(402);
      expect(authorization.response.headers.has('X-SIWX-EXTENSION')).toBe(
        false
      );
      const paymentRequired = decodePaymentRequiredHeader(
        authorization.response.headers.get('PAYMENT-REQUIRED')!
      );
      const siwx = paymentRequired.extensions?.[SIGN_IN_WITH_X] as {
        info: { domain: string; uri: string };
        supportedChains: Array<{ chainId: string; type: string }>;
      };
      expect(siwx.info.domain).toBe('public.agent.example.com');
      expect(siwx.info.uri).toBe(
        'https://public.agent.example.com/entrypoints/paid/stream'
      );
      expect(siwx.supportedChains).toEqual([
        { chainId: 'eip155:84532', type: 'eip191' },
      ]);
      const body = await authorization.response.json();
      expect(body.extensions[SIGN_IN_WITH_X]).toEqual(siwx);
      await runtime.close();
    });
  });

  it('evicts failed x402 server initialization so authorization can retry', async () => {
    let failSupported = true;
    await withFacilitator(
      async () => {
        const runtime = createPaymentsRuntime(baseConfig)!;
        const paid: EntrypointDef = {
          key: 'retry-x402',
          price: '0.001',
          paymentProtocol: 'x402',
        };
        const request = () =>
          new Request('https://agent.example.com/retry', { method: 'POST' });

        const failed = await runtime.authorize(request(), paid, 'invoke');
        expect(failed.authorized).toBe(false);
        if (failed.authorized) throw new Error('Expected initialization error');
        expect(failed.response.status).toBe(503);
        expect(await failed.response.json()).toEqual({
          error: {
            code: 'payment_configuration_error',
            message: 'x402 payment verification is temporarily unavailable.',
          },
        });

        failSupported = false;
        const retried = await runtime.authorize(request(), paid, 'invoke');
        expect(retried.authorized).toBe(false);
        if (retried.authorized) throw new Error('Expected payment challenge');
        expect(retried.response.status).toBe(402);
        await runtime.close();
      },
      { failSupported: () => failSupported }
    );
  });

  it('binds cached x402 servers to the full request resource', async () => {
    await withFacilitator(async () => {
      const runtime = createPaymentsRuntime(baseConfig)!;
      const paid: EntrypointDef = {
        key: 'resource-bound',
        price: '0.001',
        paymentProtocol: 'x402',
      };
      const first = await runtime.authorize(
        new Request('https://alpha.agent.example/pay?tenant=one#ignored', {
          method: 'POST',
        }),
        paid,
        'invoke'
      );
      const second = await runtime.authorize(
        new Request('https://beta.agent.example/pay?tenant=two', {
          method: 'POST',
        }),
        paid,
        'invoke'
      );
      if (first.authorized || second.authorized) {
        throw new Error('Expected payment challenges');
      }

      const firstRequired = decodePaymentRequiredHeader(
        first.response.headers.get('PAYMENT-REQUIRED')!
      );
      const secondRequired = decodePaymentRequiredHeader(
        second.response.headers.get('PAYMENT-REQUIRED')!
      );
      expect(firstRequired.resource.url).toBe(
        'https://alpha.agent.example/pay?tenant=one'
      );
      expect(secondRequired.resource.url).toBe(
        'https://beta.agent.example/pay?tenant=two'
      );
      await runtime.close();
    });
  });

  it('bounds the x402 server cache with least-recently-used eviction', async () => {
    let supportedCalls = 0;
    await withFacilitator(
      async () => {
        const runtime = createPaymentsRuntime(baseConfig)!;
        const paid: EntrypointDef = {
          key: 'bounded-cache',
          price: '0.001',
          paymentProtocol: 'x402',
        };
        for (let index = 0; index < 129; index += 1) {
          await runtime.authorize(
            new Request(`https://agent.example/pay?resource=${index}`, {
              method: 'POST',
            }),
            paid,
            'invoke'
          );
        }
        expect(supportedCalls).toBe(129);
        await runtime.authorize(
          new Request('https://agent.example/pay?resource=0', {
            method: 'POST',
          }),
          paid,
          'invoke'
        );
        expect(supportedCalls).toBe(130);
        await runtime.close();
      },
      { onSupported: () => (supportedCalls += 1) }
    );
  });

  it('rejects credential-bearing facilitator URLs without reflecting secrets', async () => {
    const runtime = createPaymentsRuntime({
      ...baseConfig,
      facilitatorUrl: 'https://api-user:super-secret@facilitator.example.com',
    })!;
    const authorization = await runtime.authorize(
      new Request('https://agent.example/pay', { method: 'POST' }),
      {
        key: 'credential-url',
        price: '0.001',
        paymentProtocol: 'x402',
      },
      'invoke'
    );

    expect(authorization.authorized).toBe(false);
    if (authorization.authorized) throw new Error('Expected rejection');
    expect(authorization.response.status).toBe(503);
    const body = await authorization.response.text();
    expect(body).toContain('use facilitatorAuth instead');
    expect(body).not.toContain('api-user');
    expect(body).not.toContain('super-secret');
    await runtime.close();
  });

  it('contains facilitator verification failures behind a stable public error', async () => {
    await withFacilitator(
      async () => {
        const runtime = createPaymentsRuntime(baseConfig)!;
        const paid: EntrypointDef = {
          key: 'provider-failure',
          price: '0.001',
          paymentProtocol: 'x402',
        };
        const request = new Request('https://agent.example/pay', {
          method: 'POST',
        });
        const challenge = await runtime.authorize(
          new Request(request),
          paid,
          'invoke'
        );
        if (challenge.authorized) throw new Error('Expected challenge');
        const failed = await runtime.authorize(
          new Request(request, {
            headers: {
              'PAYMENT-SIGNATURE': x402PaymentSignature(
                challenge.response,
                '0x1234567890123456789012345678901234567890'
              ),
            },
          }),
          paid,
          'invoke'
        );

        expect(failed.authorized).toBe(false);
        if (failed.authorized) throw new Error('Expected provider failure');
        const body = await failed.response.text();
        expect(body).toContain(
          'x402 payment verification is temporarily unavailable.'
        );
        expect(body).not.toContain('provider-secret-should-not-be-public');
        await runtime.close();
      },
      { failVerify: () => true }
    );
  });

  it('contains facilitator settlement failures behind a stable public error', async () => {
    await withFacilitator(
      async () => {
        const runtime = createPaymentsRuntime(baseConfig)!;
        const paid: EntrypointDef = {
          key: 'settlement-failure',
          price: '0.001',
          paymentProtocol: 'x402',
        };
        const request = new Request('https://agent.example/pay', {
          method: 'POST',
        });
        const challenge = await runtime.authorize(
          new Request(request),
          paid,
          'invoke'
        );
        if (challenge.authorized) throw new Error('Expected challenge');
        const authorized = await runtime.authorize(
          new Request(request, {
            headers: {
              'PAYMENT-SIGNATURE': x402PaymentSignature(
                challenge.response,
                '0x1234567890123456789012345678901234567890'
              ),
            },
          }),
          paid,
          'invoke'
        );
        if (!authorized.authorized) throw new Error('Expected authorization');
        const admission = await authorized.admit();
        if (!admission.admitted) throw new Error('Expected admission');
        const response = await admission.finalize(Response.json({ ok: true }));
        const body = await response.text();

        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(body).toMatch(
          /Payment settlement (?:is temporarily unavailable|was rejected)\./u
        );
        expect(body).not.toContain('settlement-secret-should-not-be-public');
        await runtime.close();
      },
      { failSettle: () => true }
    );
  });

  it('records verified payments for non-total incoming policies', async () => {
    const runtime = createPaymentsRuntime({
      ...baseConfig,
      policyGroups: [
        {
          name: 'per-payment-only',
          incomingLimits: { global: { maxPaymentUsd: 2 } },
        },
      ],
    })!;
    const authorization = await runtime.authorize(
      mppRequest(),
      entrypoint,
      'invoke',
      {
        protocol: 'mpp',
        payer: '0xpayer',
        amount: '1',
        currency: 'usdc',
      }
    );
    if (!authorization.authorized) throw new Error('Expected authorization');
    const admission = await authorization.admit();
    if (!admission.admitted) throw new Error('Expected admission');
    expect((await admission.finalize(Response.json({ ok: true }))).status).toBe(
      200
    );
    expect(
      await runtime.paymentTracker?.getIncomingTotal(
        'per-payment-only',
        'global'
      )
    ).toBe(1_000_000n);
    await runtime.close();
  });

  it('returns a no-op admission for free entrypoints', async () => {
    const runtime = createPaymentsRuntime(baseConfig)!;
    const authorization = await runtime.authorize(
      mppRequest(),
      { key: 'free' },
      'invoke'
    );
    if (!authorization.authorized) throw new Error('Expected free entrypoint');
    const admission = await authorization.admit();
    expect(admission.admitted).toBe(true);
    if (!admission.admitted) throw new Error('Expected no-op admission');
    await admission.abort();
    const response = Response.json({ ok: true });
    expect(await admission.finalize(response)).toBe(response);
    await runtime.close();
  });

  it('accepts native-token MPP payments when no USD amount policy applies', async () => {
    const runtime = createPaymentsRuntime(baseConfig)!;
    const authorization = await runtime.authorize(
      mppRequest(),
      entrypoint,
      'invoke',
      {
        protocol: 'mpp',
        payer: '0xpayer',
        amount: '1000000',
        currency: '0x20c0000000000000000000000000000000000001',
        network: 'eip155:42431',
      }
    );

    expect(authorization.authorized).toBe(true);
    if (!authorization.authorized) throw new Error('Expected authorization');
    const admission = await authorization.admit();
    expect(admission.admitted).toBe(true);
    await runtime.close();
  });

  it('fails closed when USD policies cannot value a native-token MPP payment', async () => {
    const runtime = createPaymentsRuntime({
      ...baseConfig,
      policyGroups: [
        {
          name: 'usd-budget',
          incomingLimits: { global: { maxTotalUsd: 1 } },
        },
      ],
    })!;
    const authorization = await runtime.authorize(
      mppRequest(),
      entrypoint,
      'invoke',
      {
        protocol: 'mpp',
        payer: '0xpayer',
        amount: '1000000',
        currency: '0x20c0000000000000000000000000000000000001',
        network: 'eip155:42431',
      }
    );

    expect(authorization.authorized).toBe(false);
    if (authorization.authorized) throw new Error('Expected rejection');
    expect(authorization.response.status).toBe(503);
    await runtime.close();
  });

  it('does not trust a caller-controlled Origin as sender identity', async () => {
    const runtime = createPaymentsRuntime({
      ...baseConfig,
      policyGroups: [
        {
          name: 'trusted-domain',
          allowedSenders: ['trusted.example.com'],
        },
      ],
    })!;

    const authorization = await runtime.authorize(
      mppRequest('https://trusted.example.com'),
      entrypoint,
      'invoke',
      {
        protocol: 'mpp',
        payer: '0xunlisted',
        amount: '1',
        currency: 'usd',
      }
    );

    expect(authorization.authorized).toBe(true);
    if (!authorization.authorized) {
      throw new Error(
        'Expected the verified payment to reach policy admission'
      );
    }
    const admission = await authorization.admit();
    expect(admission.admitted).toBe(false);
    if (admission.admitted) throw new Error('Expected sender policy rejection');
    expect(admission.response.status).toBe(403);
    await runtime.close();
  });

  it('applies sender, total, and rate policies to verified MPP payments', async () => {
    const payer = '0x0000000000000000000000000000000000000001';
    const runtime = createPaymentsRuntime({
      ...baseConfig,
      policyGroups: [
        {
          name: 'mpp-policy',
          allowedSenders: [payer],
          incomingLimits: { global: { maxTotalUsd: 1.5 } },
          rateLimits: { maxPayments: 1, windowMs: 60_000 },
        },
      ],
    })!;

    const first = await runtime.authorize(mppRequest(), entrypoint, 'invoke', {
      protocol: 'mpp',
      payer,
      amount: '1',
      currency: 'usd',
    });
    expect(first.authorized).toBe(true);
    if (!first.authorized) throw new Error('Expected MPP payment to pass');
    const firstAdmission = await first.admit();
    if (!firstAdmission.admitted) throw new Error('Expected MPP admission');
    expect(
      (await firstAdmission.finalize(Response.json({ ok: true }))).status
    ).toBe(200);
    expect(
      await runtime.paymentTracker?.getIncomingTotal('mpp-policy', 'global')
    ).toBe(1_000_000n);

    const second = await runtime.authorize(mppRequest(), entrypoint, 'invoke', {
      protocol: 'mpp',
      payer,
      amount: '0.25',
      currency: 'usd',
    });
    expect(second.authorized).toBe(true);
    if (!second.authorized) throw new Error('Expected payment verification');
    const secondAdmission = await second.admit();
    expect(secondAdmission.admitted).toBe(false);
    if (secondAdmission.admitted)
      throw new Error('Expected rate limit rejection');
    expect(secondAdmission.response.status).toBe(403);
    await runtime.close();
  });

  it('replaces a verified MPP session ceiling with delivered usage', async () => {
    const runtime = createPaymentsRuntime({
      ...baseConfig,
      policyGroups: [
        {
          name: 'mpp-session-policy',
          incomingLimits: { global: { maxTotalUsd: 5 } },
        },
      ],
    })!;
    const channelId = `0x${'ab'.repeat(32)}`;
    const authorization = await runtime.authorize(
      mppRequest(),
      entrypoint,
      'stream',
      {
        protocol: 'mpp',
        payer: '0xpayer',
        amount: '3',
        currency: 'usd',
        intent: 'session',
        reference: channelId,
        maximumAmount: '3000000',
      }
    );
    if (!authorization.authorized) {
      throw new Error('Expected MPP session authorization');
    }
    const admission = await authorization.admit();
    if (!admission.admitted) throw new Error('Expected session admission');

    const response = await admission.finalize(Response.json({ ok: true }), {
      payment: {
        actualAmount: '2000000',
        asset: 'usd',
        reference: channelId,
      },
    });

    expect(response.status).toBe(200);
    expect(
      await runtime.paymentTracker?.getIncomingTotal(
        'mpp-session-policy',
        'global'
      )
    ).toBe(2_000_000n);
    await runtime.close();
  });

  it('rejects MPP session accounting above its ceiling or for another channel', async () => {
    const createRuntime = () =>
      createPaymentsRuntime({
        ...baseConfig,
        policyGroups: [
          {
            name: 'mpp-session-policy',
            incomingLimits: { global: { maxTotalUsd: 5 } },
          },
        ],
      })!;
    const channelId = `0x${'ab'.repeat(32)}`;
    for (const payment of [
      {
        actualAmount: '3000001',
        asset: 'usd',
        reference: channelId,
      },
      {
        actualAmount: '1000000',
        asset: 'usd',
        reference: `0x${'cd'.repeat(32)}`,
      },
    ]) {
      const runtime = createRuntime();
      const authorization = await runtime.authorize(
        mppRequest(),
        entrypoint,
        'stream',
        {
          protocol: 'mpp',
          amount: '3',
          currency: 'usd',
          intent: 'session',
          reference: channelId,
          maximumAmount: '3000000',
        }
      );
      if (!authorization.authorized) {
        throw new Error('Expected MPP session authorization');
      }
      const admission = await authorization.admit();
      if (!admission.admitted) throw new Error('Expected session admission');

      expect(
        (await admission.finalize(Response.json({ ok: true }), { payment }))
          .status
      ).toBe(500);
      expect(
        await runtime.paymentTracker?.getIncomingTotal(
          'mpp-session-policy',
          'global'
        )
      ).toBe(0n);
      await runtime.close();
    }
  });

  it('releases MPP reservations when execution fails', async () => {
    const runtime = createPaymentsRuntime({
      ...baseConfig,
      policyGroups: [
        {
          name: 'one-at-a-time',
          rateLimits: { maxPayments: 1, windowMs: 60_000 },
        },
      ],
    })!;
    const payment = {
      protocol: 'mpp' as const,
      payer: '0xpayer',
      amount: '1',
      currency: 'usd',
    };

    const first = await runtime.authorize(
      mppRequest(),
      entrypoint,
      'invoke',
      payment
    );
    if (!first.authorized) throw new Error('Expected first authorization');
    const firstAdmission = await first.admit();
    if (!firstAdmission.admitted) throw new Error('Expected first admission');
    expect(
      (await firstAdmission.finalize(new Response(null, { status: 500 })))
        .status
    ).toBe(500);

    const retry = await runtime.authorize(
      mppRequest(),
      entrypoint,
      'invoke',
      payment
    );
    expect(retry.authorized).toBe(true);
    await runtime.close();
  });

  it('exposes a stable verified subject and aborts provisional reservations', async () => {
    const runtime = createPaymentsRuntime({
      ...baseConfig,
      policyGroups: [
        {
          name: 'one-at-a-time',
          rateLimits: { maxPayments: 1, windowMs: 60_000 },
        },
      ],
    })!;
    const payment = {
      protocol: 'mpp' as const,
      payer: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
      amount: '1',
      currency: 'usd',
      network: 'eip155:84532',
    };

    const first = await runtime.authorize(
      mppRequest(),
      entrypoint,
      'invoke',
      payment
    );
    if (!first.authorized) throw new Error('Expected first authorization');
    expect(first.subject).toBe(
      'payment:eip155:84532:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    );
    const admission = await first.admit();
    if (!admission.admitted) throw new Error('Expected first admission');
    await admission.abort();

    const retry = await runtime.authorize(
      mppRequest(),
      entrypoint,
      'invoke',
      payment
    );
    expect(retry.authorized).toBe(true);
    await runtime.close();
  });

  it('does not release policy capacity after settlement accounting fails', async () => {
    const originalNow = Date.now;
    let now = 1_000_000;
    Date.now = () => now;
    const delegate = createInMemoryPaymentStorage();
    let releases = 0;
    const storage: PaymentStorage = {
      recordPayment: record => delegate.recordPayment(record),
      getTotal: (...args) => delegate.getTotal(...args),
      getAllRecords: (...args) => delegate.getAllRecords(...args),
      reservePaymentLimit: reservation =>
        delegate.reservePaymentLimit(reservation),
      commitPaymentReservation: id => delegate.commitPaymentReservation(id),
      commitPaymentReservations: (...args) =>
        delegate.commitPaymentReservations(...args),
      stagePaymentSettlement: (...args) =>
        delegate.stagePaymentSettlement(...args),
      adjustPaymentSettlement: (...args) =>
        delegate.adjustPaymentSettlement(...args),
      commitPaymentSettlement: async () => {
        throw new Error('accounting unavailable');
      },
      releasePaymentSettlement: id => delegate.releasePaymentSettlement(id),
      releasePaymentReservation: async id => {
        releases += 1;
        await delegate.releasePaymentReservation(id);
      },
      clear: () => delegate.clear(),
    };
    const runtime = createPaymentsRuntime(
      {
        ...baseConfig,
        policyGroups: [
          {
            name: 'settled-capacity',
            incomingLimits: { global: { maxTotalUsd: 1 } },
          },
        ],
      },
      undefined,
      () => storage
    )!;
    const payment = {
      protocol: 'mpp' as const,
      payer: '0xpayer',
      amount: '1',
      currency: 'usd',
    };

    try {
      const authorization = await runtime.authorize(
        mppRequest(),
        entrypoint,
        'invoke',
        payment
      );
      if (!authorization.authorized) throw new Error('Expected authorization');
      const admission = await authorization.admit();
      if (!admission.admitted) throw new Error('Expected admission');
      const response = await admission.finalize(Response.json({ ok: true }));

      expect(response.status).toBe(503);
      expect(admission.isCommitted?.()).toBe(true);
      expect(releases).toBe(0);

      const retry = await runtime.authorize(
        mppRequest(),
        entrypoint,
        'invoke',
        payment
      );
      if (!retry.authorized) throw new Error('Expected verified retry');
      const retryAdmission = await retry.admit();
      expect(retryAdmission.admitted).toBe(false);

      now += 5 * 60_000 + 1;
      const expiredRetry = await runtime.authorize(
        mppRequest(),
        entrypoint,
        'invoke',
        payment
      );
      if (!expiredRetry.authorized) throw new Error('Expected verified retry');
      const expiredRetryAdmission = await expiredRetry.admit();
      expect(expiredRetryAdmission.admitted).toBe(false);
    } finally {
      Date.now = originalNow;
      await runtime.close();
    }
  });

  it('contains SIWX storage failures and returns a deterministic error', async () => {
    const storage: SIWxStorage = {
      hasPaid: async () => false,
      recordPayment: async () => {
        throw new Error('entitlement store unavailable');
      },
      hasUsedNonce: async () => false,
      recordNonce: async () => {},
      consumeNonce: async () => 'consumed',
      clear: async () => {},
    };
    const runtime = createPaymentsRuntime(
      {
        ...baseConfig,
        siwx: {
          enabled: true,
          origin: 'https://agent.example.com',
        },
      },
      undefined,
      undefined,
      () => storage
    )!;

    const authorization = await runtime.authorize(
      mppRequest(),
      { ...entrypoint, siwx: { enabled: true } },
      'invoke',
      {
        protocol: 'mpp',
        payer: '0xpayer',
        amount: '1',
        currency: 'usd',
        network: 'eip155:84532',
      }
    );
    if (!authorization.authorized) {
      throw new Error('Expected verified payment authorization');
    }
    const admission = await authorization.admit();
    if (!admission.admitted) {
      throw new Error('Expected verified payment admission');
    }
    const response = await admission.finalize(Response.json({ ok: true }));

    expect(response.status).toBe(503);
    expect(admission.isCommitted?.()).toBe(true);
    expect(await response.json()).toEqual({
      error: {
        code: 'payment_recording_failed',
        message: 'entitlement store unavailable',
      },
    });
    await runtime.close();
  });
});
