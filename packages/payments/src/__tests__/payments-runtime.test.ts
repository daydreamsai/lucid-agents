import type { EntrypointDef } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import { describe, expect, it, spyOn } from 'bun:test';
import { encodePaymentRequiredHeader } from '@x402/core/http';

import { createInMemoryPaymentStorage } from '../in-memory-payment-storage';
import {
  createPaymentsRuntime,
  entrypointHasExplicitPrice,
  evaluatePaymentRequirement,
  resolveActivePayments,
  resolvePaymentRequirement,
} from '../payments';
import { createInMemorySIWxStorage } from '../siwx-in-memory-storage';
import { payments } from '../extension';

const config: PaymentsConfig = {
  facilitatorUrl: 'https://facilitator.example.com',
  network: 'eip155:84532',
  payTo: '0x0000000000000000000000000000000000000001',
};

describe('payments runtime behavior', () => {
  it('composes, activates, manifests, and disposes the payments extension', async () => {
    const storage = createInMemoryPaymentStorage();
    let closes = 0;
    storage.close = () => {
      closes += 1;
    };
    const extension = payments({
      config,
      storageFactory: () => storage,
    });
    const slice = await extension.build({} as never);
    const priced: EntrypointDef = { key: 'paid', price: '1' };
    extension.onEntrypointAdded!(priced, {} as never);
    const manifest = extension.onManifestBuild!(
      { name: 'agent', version: '1', entrypoints: {} },
      { entrypoints: { snapshot: () => [priced] } } as never
    );

    expect(extension.after).toEqual(['wallets']);
    expect(slice.payments?.isActive).toBe(true);
    expect(manifest.payments).toHaveLength(1);
    await extension.dispose?.({} as never);
    expect(closes).toBe(1);
  });

  it('recognizes supported price shapes and warns about legacy formats', () => {
    const warning = spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(entrypointHasExplicitPrice({ key: 'none' })).toBe(false);
    expect(entrypointHasExplicitPrice({ key: 'blank', price: '  ' })).toBe(
      false
    );
    expect(entrypointHasExplicitPrice({ key: 'flat', price: '1' })).toBe(true);
    expect(
      entrypointHasExplicitPrice({ key: 'invoke', price: { invoke: '1' } })
    ).toBe(true);
    expect(
      entrypointHasExplicitPrice({ key: 'stream', price: { stream: '1' } })
    ).toBe(true);
    expect(
      entrypointHasExplicitPrice({
        key: 'legacy',
        price: { amount: '1' } as never,
      })
    ).toBe(false);
    expect(
      entrypointHasExplicitPrice({ key: 'number', price: 1 as never })
    ).toBe(false);
    expect(warning).toHaveBeenCalledTimes(2);
    warning.mockRestore();
  });

  it('activates only eligible x402 or SIWX entrypoints', () => {
    expect(
      resolveActivePayments(
        { key: 'paid', price: '1' },
        false,
        config,
        undefined
      )
    ).toBeUndefined();
    expect(
      resolveActivePayments({ key: 'free' }, config, config, undefined)
    ).toBeUndefined();
    expect(
      resolveActivePayments(
        { key: 'mpp', price: '1', paymentProtocol: 'mpp' },
        config,
        config,
        undefined
      )
    ).toBeUndefined();
    expect(
      resolveActivePayments(
        { key: 'auth', siwx: { authOnly: true } },
        config,
        config,
        undefined
      )
    ).toEqual(config);
    expect(
      resolveActivePayments(
        { key: 'paid', price: '1' },
        config,
        undefined,
        undefined
      )
    ).toBeUndefined();
    expect(
      resolveActivePayments({ key: 'paid', price: '1' }, config, config, config)
    ).toBe(config);
  });

  it('activates explicit exact offers without a legacy price', () => {
    const runtime = createPaymentsRuntime(config)!;
    const entrypoint: EntrypointDef = {
      key: 'multi-offer',
      paymentProtocol: 'x402',
      x402: {
        offers: [
          {
            scheme: 'exact',
            network: 'eip155:84532',
            price: '0.01',
            payTo: '0x0000000000000000000000000000000000000002',
            facilitatorUrl: 'https://evm-facilitator.example',
          },
          {
            scheme: 'exact',
            network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
            price: {
              amount: '2000',
              asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            },
            payTo: '11111111111111111111111111111111',
            facilitatorUrl: 'https://svm-facilitator.example',
          },
        ],
      },
    };

    runtime.activate(entrypoint);
    const requirement = runtime.requirements(entrypoint, 'invoke');

    expect(runtime.isActive).toBe(true);
    expect(requirement).toEqual(
      expect.objectContaining({
        required: true,
        price: '0.01',
        network: 'eip155:84532',
        payTo: '0x0000000000000000000000000000000000000002',
        facilitatorUrl: 'https://evm-facilitator.example',
        offers: entrypoint.x402?.offers,
      })
    );
  });

  it('activates released upto offers for invoke-only entrypoints', async () => {
    const runtime = createPaymentsRuntime(config)!;
    const metered: EntrypointDef = {
      key: 'metered',
      paymentProtocol: 'x402',
      x402: {
        offers: [
          {
            scheme: 'upto',
            network: 'eip155:84532',
            maximum: '1',
          },
        ],
      },
    };

    runtime.activate(metered);
    expect(runtime.requirements(metered, 'invoke')).toMatchObject({
      required: true,
      price: '1',
      offers: metered.x402?.offers,
    });
    expect(() => runtime.requirements(metered, 'stream')).toThrow(
      'upto only supports invoke operations'
    );
    expect(() => runtime.requirements(metered, 'task')).toThrow(
      'upto only supports invoke operations'
    );
    await runtime.close();
  });

  it('rejects upto activation when the entrypoint exposes streaming', () => {
    const runtime = createPaymentsRuntime(config)!;
    expect(() =>
      runtime.activate({
        key: 'metered-stream',
        paymentProtocol: 'x402',
        stream: async () => ({ usage: {} }),
        x402: {
          offers: [
            {
              scheme: 'upto',
              network: 'eip155:84532',
              maximum: '1',
            },
          ],
        },
      })
    ).toThrow('upto only supports invoke operations');
  });

  it('rejects ambiguous facilitators for the same scheme and network', () => {
    const runtime = createPaymentsRuntime(config)!;

    expect(() =>
      runtime.activate({
        key: 'ambiguous',
        paymentProtocol: 'x402',
        x402: {
          offers: [
            {
              scheme: 'exact',
              network: 'eip155:84532',
              price: '0.01',
              facilitatorUrl: 'https://facilitator-a.example',
            },
            {
              scheme: 'exact',
              network: 'eip155:84532',
              price: '0.02',
              facilitatorUrl: 'https://facilitator-b.example',
            },
          ],
        },
      })
    ).toThrow('x402 offers for exact on eip155:84532 must use one facilitator');
  });

  it('uses config offers only for entrypoints that opt into x402', () => {
    const offerConfig: PaymentsConfig = {
      ...config,
      offers: [
        {
          scheme: 'exact',
          network: 'eip155:8453',
          price: '0.25',
          payTo: '0x0000000000000000000000000000000000000003',
          facilitatorUrl: 'https://base-facilitator.example',
        },
      ],
    };
    const runtime = createPaymentsRuntime(offerConfig)!;
    const paid: EntrypointDef = { key: 'paid', price: '99' };

    runtime.activate(paid);

    expect(runtime.requirements(paid, 'invoke')).toEqual(
      expect.objectContaining({
        required: true,
        price: '0.25',
        network: 'eip155:8453',
        offers: offerConfig.offers,
      })
    );
    expect(runtime.requirements({ key: 'free' }, 'invoke')).toEqual({
      required: false,
    });
    expect(
      resolvePaymentRequirement(
        { key: 'explicit', paymentProtocol: 'x402' },
        'invoke',
        offerConfig
      )
    ).toEqual(
      expect.objectContaining({
        required: true,
        price: '0.25',
        offers: offerConfig.offers,
      })
    );
  });

  it('resolves payment requirements and produces x402 responses', async () => {
    const paid: EntrypointDef = { key: 'paid', price: '1' };

    expect(resolvePaymentRequirement(paid, 'invoke')).toEqual({
      required: false,
    });
    expect(
      resolvePaymentRequirement(
        { ...paid, paymentProtocol: 'mpp' },
        'invoke',
        config
      )
    ).toEqual({ required: false });
    expect(
      resolvePaymentRequirement({ key: 'free' }, 'invoke', config)
    ).toEqual({ required: false });

    const requirement = evaluatePaymentRequirement(paid, 'invoke', config);
    expect(requirement.required).toBe(true);
    if (!requirement.required) throw new Error('Expected payment requirement');
    expect(requirement.network).toBe('eip155:84532');
    expect(requirement.payTo).toBe(config.payTo);
    expect(requirement.response.status).toBe(402);
    expect(await requirement.response.clone().json()).toEqual(
      expect.objectContaining({ x402Version: 2 })
    );
    expect(requirement.response.headers.has('PAYMENT-REQUIRED')).toBe(true);
  });

  it('normalizes config, exposes state, and closes custom stores once', async () => {
    const storage = createInMemoryPaymentStorage();
    const siwxStorage = createInMemorySIWxStorage();
    let paymentCloses = 0;
    let siwxCloses = 0;
    storage.close = () => {
      paymentCloses += 1;
    };
    siwxStorage.close = () => {
      siwxCloses += 1;
    };
    const runtime = createPaymentsRuntime(
      {
        ...config,
        policyGroups: [{ name: 'daily' }],
        siwx: {
          enabled: true,
          origin: 'https://agent.example.com',
        },
      },
      'agent-1',
      (_storageConfig, agentId) => {
        expect(agentId).toBe('agent-1');
        return storage;
      },
      () => siwxStorage
    )!;

    expect(runtime.config.network).toBe('eip155:84532');
    expect(runtime.paymentTracker).toBeDefined();
    expect(runtime.policyGroups).toEqual([{ name: 'daily' }]);
    expect(runtime.siwxStorage).toBe(siwxStorage);
    expect(runtime.siwxConfig?.enabled).toBe(true);
    expect(runtime.isActive).toBe(false);
    expect(runtime.requirements({ key: 'paid', price: '1' }, 'invoke')).toEqual(
      {
        required: false,
      }
    );

    runtime.activate({ key: 'mpp', price: '1', paymentProtocol: 'mpp' });
    expect(runtime.isActive).toBe(false);
    runtime.activate({ key: 'paid', price: '1' });
    expect(runtime.isActive).toBe(true);
    runtime.activate({ key: 'another', price: '2' });
    expect(runtime.resolvePrice({ key: 'paid', price: '1' }, 'invoke')).toBe(
      '1'
    );
    expect(
      runtime.resolvePrice(
        { key: 'mpp', price: '1', paymentProtocol: 'mpp' },
        'invoke'
      )
    ).toBeNull();

    await Promise.all([runtime.close(), runtime.close()]);
    expect(paymentCloses).toBe(1);
    expect(siwxCloses).toBe(1);
  });

  it('keeps the public runtime paid fetch on the exact EVM buyer', async () => {
    const runtime = createPaymentsRuntime(config)!;
    const originalFetch = globalThis.fetch;
    const paymentSignatures: Array<string | null> = [];
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      const request = new Request(input, init);
      paymentSignatures.push(request.headers.get('PAYMENT-SIGNATURE'));
      if (paymentSignatures.length === 1) {
        return new Response(null, {
          status: 402,
          headers: {
            'PAYMENT-REQUIRED': encodePaymentRequiredHeader({
              x402Version: 2,
              accepts: [
                {
                  scheme: 'exact',
                  network: 'eip155:84532',
                  amount: '1000',
                  payTo: config.payTo,
                  maxTimeoutSeconds: 300,
                  asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7c',
                  extra: { name: 'USDC', version: '2' },
                },
              ],
              resource: {
                url: 'https://seller.example/invoke',
                description: 'Paid invocation',
                mimeType: 'application/json',
              },
            }),
          },
        });
      }
      return new Response('paid');
    }) as typeof globalThis.fetch;

    try {
      const paidFetch = await runtime.getFetchWithPayment(
        {
          wallets: {
            agent: {
              kind: 'local',
              connector: {
                getWalletMetadata: async () => ({
                  address: '0xb308ed39d67D0d4BAe5BC2FAEF60c66BBb6AE429',
                }),
                signChallenge: async () => '0xdeadbeef',
                supportsCaip2: async () => true,
              },
            },
          },
          payments: runtime,
        } as never,
        'base-sepolia'
      );
      const response = await paidFetch?.('https://seller.example/invoke', {
        method: 'POST',
      });

      expect(response?.status).toBe(200);
      expect(paymentSignatures[0]).toBeNull();
      expect(paymentSignatures[1]).toBeTruthy();
    } finally {
      globalThis.fetch = originalFetch;
      await runtime.close();
    }
  });

  it('returns no runtime when payments are disabled and wraps factory failures', () => {
    expect(createPaymentsRuntime(undefined)).toBeUndefined();
    expect(createPaymentsRuntime(false)).toBeUndefined();
    expect(() =>
      createPaymentsRuntime(config, undefined, () => {
        throw new Error('storage offline');
      })
    ).toThrow('Failed to initialize payment storage: storage offline');
    expect(() =>
      createPaymentsRuntime(
        {
          ...config,
          siwx: {
            enabled: true,
            origin: 'https://agent.example.com',
          },
        },
        undefined,
        () => createInMemoryPaymentStorage(),
        () => {
          throw new Error('siwx offline');
        }
      )
    ).toThrow('Failed to initialize SIWX storage: siwx offline');
  });
});
