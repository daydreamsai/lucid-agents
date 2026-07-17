import type { EntrypointDef } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import { describe, expect, it, spyOn } from 'bun:test';

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
        siwx: { enabled: true },
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
        { ...config, siwx: { enabled: true } },
        undefined,
        () => createInMemoryPaymentStorage(),
        () => {
          throw new Error('siwx offline');
        }
      )
    ).toThrow('Failed to initialize SIWX storage: siwx offline');
  });
});
