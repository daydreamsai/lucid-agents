import { describe, expect, it } from 'bun:test';
import type { EntrypointDef } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import type { PaymentPayload } from '@x402/core/types';

import {
  batchSettlementReceiptHeaders,
  createBatchSettlementChannelManager,
  resolveBatchSettlementChargedAmount,
} from '../batch-settlement';
import { createInMemoryBatchChannelStorage } from '../in-memory-batch-channel-storage';
import { createPaymentsRuntime } from '../payments';
import { registerSellerSchemes } from '../x402-scheme-registry';
import { compileX402Offers } from '../x402-offers';

const PAY_TO = '0x0000000000000000000000000000000000000001';
const config: PaymentsConfig = {
  facilitatorUrl: 'https://facilitator.example',
  network: 'eip155:84532',
  payTo: PAY_TO,
};
const entrypoint: EntrypointDef = {
  key: 'channel',
  paymentProtocol: 'x402',
  x402: {
    offers: [
      {
        scheme: 'batch-settlement',
        network: 'eip155:84532',
        maximum: { amount: '1000', asset: PAY_TO },
      },
    ],
  },
};

describe('x402 batch-settlement runtime', () => {
  it('activates explicit offers only with explicit development or production storage mode', async () => {
    const missing = createPaymentsRuntime(config)!;
    expect(() => missing.activate(entrypoint)).toThrow(
      'requires explicit batchSettlement configuration'
    );
    await missing.close();

    const development = createPaymentsRuntime(
      config,
      undefined,
      undefined,
      undefined,
      { mode: 'development' }
    )!;
    development.activate(entrypoint);
    expect(development.requirements(entrypoint, 'invoke')).toMatchObject({
      required: true,
      price: '1000',
      network: 'eip155:84532',
      offers: entrypoint.x402?.offers,
    });
    await development.close();
  });

  it('rejects ephemeral production storage and closes an injected durable store once', async () => {
    const ephemeral = createInMemoryBatchChannelStorage();
    const invalid = createPaymentsRuntime(
      config,
      undefined,
      undefined,
      undefined,
      { mode: 'production', storage: ephemeral }
    )!;
    expect(() => invalid.activate(entrypoint)).toThrow(
      'production mode requires durable channel storage'
    );
    await invalid.close();

    const durable = createInMemoryBatchChannelStorage() as ReturnType<
      typeof createInMemoryBatchChannelStorage
    > & { durable: boolean };
    Object.defineProperty(durable, 'durable', { value: true });
    let closes = 0;
    const originalClose = durable.close.bind(durable);
    durable.close = async () => {
      closes += 1;
      await originalClose();
    };
    const runtime = createPaymentsRuntime(
      config,
      undefined,
      undefined,
      undefined,
      { mode: 'production', storage: durable }
    )!;
    runtime.activate(entrypoint);
    await Promise.all([runtime.close(), runtime.close(), runtime.close()]);
    expect(closes).toBe(1);
  });

  it('registers exact and batch schemes together without reordering offers', async () => {
    const mixed: EntrypointDef = {
      key: 'mixed',
      paymentProtocol: 'x402',
      x402: {
        offers: [
          {
            scheme: 'exact',
            network: 'eip155:84532',
            price: '10',
          },
          {
            scheme: 'batch-settlement',
            network: 'eip155:84532',
            maximum: '50',
          },
          {
            scheme: 'upto',
            network: 'eip155:84532',
            maximum: '25',
          },
        ],
      },
    };
    const compiled = compileX402Offers(mixed, config, 'invoke')!;
    expect(compiled.offers.map(offer => offer.scheme)).toEqual([
      'exact',
      'batch-settlement',
      'upto',
    ]);

    const registrations: Array<{ network: string; scheme: string }> = [];
    const fakeServer = {
      register(network: string, scheme: { scheme: string }) {
        registrations.push({ network, scheme: scheme.scheme });
        return this;
      },
    };
    const storage = createInMemoryBatchChannelStorage();
    await registerSellerSchemes(fakeServer as never, compiled.offers, {
      storage,
      schemeConfig: { storage },
    });
    expect(registrations).toEqual([
      { network: 'eip155:*', scheme: 'exact' },
      { network: 'eip155:*', scheme: 'upto' },
      { network: 'eip155:*', scheme: 'batch-settlement' },
    ]);
    await storage.close();
  });

  it('emits stable channel, voucher settlement, and actual receipt headers', () => {
    const channelId = `0x${'ab'.repeat(32)}`;
    const payload = {
      x402Version: 2,
      accepted: {
        scheme: 'batch-settlement',
        network: 'eip155:84532',
        amount: '1000',
        asset: PAY_TO,
        payTo: PAY_TO,
        maxTimeoutSeconds: 60,
        extra: {},
      },
      payload: {
        type: 'voucher',
        voucher: {
          channelId,
          maxClaimableAmount: '3000',
          signature: `0x${'11'.repeat(65)}`,
        },
      },
    } satisfies PaymentPayload;
    const receipt = batchSettlementReceiptHeaders(payload, {
      amount: '1000',
      extra: {},
    });

    expect(receipt).toEqual({
      'X-Lucid-X402-Channel-ID': channelId,
      'X-Lucid-X402-Settlement-ID': `batch:${channelId}:3000`,
      'X-Lucid-X402-Settled-Amount': '1000',
    });
    expect(
      batchSettlementReceiptHeaders(payload, {
        amount: '1000',
        extra: {},
      })
    ).toEqual(receipt);
  });

  it('uses the upstream charged delta when settlement amount is empty', () => {
    const channelId = `0x${'ab'.repeat(32)}`;
    const headers = batchSettlementReceiptHeaders(
      {
        x402Version: 2,
        accepted: {
          scheme: 'batch-settlement',
          network: 'eip155:84532',
          amount: '1000',
          asset: PAY_TO,
          payTo: PAY_TO,
          maxTimeoutSeconds: 60,
          extra: {},
        },
        payload: {
          type: 'voucher',
          voucher: {
            channelId,
            maxClaimableAmount: '21',
            signature: `0x${'11'.repeat(65)}`,
          },
        },
      } satisfies PaymentPayload,
      {
        amount: '',
        extra: {
          chargedAmount: '7',
          channelState: {
            channelId,
            chargedCumulativeAmount: '21',
          },
        },
      }
    );

    expect(headers['X-Lucid-X402-Settled-Amount']).toBe('7');
    expect(
      resolveBatchSettlementChargedAmount(1000n, {
        amount: '',
        extra: { chargedAmount: '7' },
      })
    ).toBe(7n);
    expect(() =>
      resolveBatchSettlementChargedAmount(6n, {
        extra: { chargedAmount: '7' },
      })
    ).toThrow('exceeds its ceiling');
    expect(() =>
      resolveBatchSettlementChargedAmount(1000n, { amount: '' })
    ).toThrow('did not report');
  });

  it('exposes seller claim, settle, and refund operations over the shared store', async () => {
    const storage = createInMemoryBatchChannelStorage();
    const facilitator = {
      getSupported: async () => ({ kinds: [], extensions: [], signers: {} }),
      verify: async () => ({ isValid: false }),
      settle: async () => ({
        success: false,
        errorReason: 'not called',
        transaction: '',
        network: 'eip155:84532' as const,
      }),
    };
    const operations = createBatchSettlementChannelManager({
      receiver: PAY_TO,
      network: 'eip155:84532',
      facilitator,
      server: { mode: 'development', storage },
    });

    expect(await operations.manager.getClaimableVouchers()).toEqual([]);
    expect(operations.manager.claim).toBeFunction();
    expect(operations.manager.settle).toBeFunction();
    expect(operations.manager.refund).toBeFunction();
    await operations.manager.stop();
    await storage.close();
  });

  it('rejects dynamic and malformed batch receivers deterministically', () => {
    expect(() =>
      compileX402Offers(
        entrypoint,
        {
          facilitatorUrl: 'https://facilitator.example',
          network: 'eip155:84532',
          stripe: { secretKey: 'sk_test' },
        },
        'invoke'
      )
    ).toThrow('requires a static EVM payTo address');
  });
});
