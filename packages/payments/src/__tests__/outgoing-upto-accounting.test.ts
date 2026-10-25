import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PaymentPolicyGroup } from '@lucid-agents/types/payments';
import {
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from '@x402/core/http';
import { createInMemoryPaymentStorage } from '../in-memory-payment-storage';
import { createPaymentTracker } from '../payment-tracker';
import type { PaymentStorage } from '../payment-storage';
import { wrapBaseFetchWithPolicy } from '../policy-wrapper';
import { SQLitePaymentStorage } from '../sqlite-payment-storage';

const url = 'https://example.com/metered';
const network = 'eip155:84532' as const;
const payTo = '0x1111111111111111111111111111111111111111';
const trackers: ReturnType<typeof createPaymentTracker>[] = [];
const directories: string[] = [];

afterEach(async () => {
  for (const tracker of trackers.splice(0)) await tracker.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture(
  options: {
    actual?: string;
    scheme?: 'exact' | 'upto';
    groups?: PaymentPolicyGroup[];
    receipt?: Record<string, unknown> | string;
    paidStatus?: number;
    storage?: PaymentStorage;
    waitForSettlement?: Promise<void>;
    onPaid?: () => void;
  } = {}
) {
  const storage = options.storage ?? createInMemoryPaymentStorage();
  const tracker = createPaymentTracker(storage);
  trackers.push(tracker);
  const scheme = options.scheme ?? 'upto';
  const groups = options.groups ?? [
    {
      name: 'budget',
      outgoingLimits: { global: { maxTotalUsd: 0.015 } },
    },
  ];
  const requirement = {
    scheme,
    network,
    amount: '10000',
    payTo,
    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    maxTimeoutSeconds: 60,
    extra:
      scheme === 'upto'
        ? {
            assetTransferMethod: 'permit2',
            facilitatorAddress: '0x2222222222222222222222222222222222222222',
          }
        : {},
  };
  const wrapped = wrapBaseFetchWithPolicy(
    async input => {
      const request = input instanceof Request ? input : new Request(input);
      if (!request.headers.has('PAYMENT-SIGNATURE')) {
        return new Response(null, {
          status: 402,
          headers: {
            'PAYMENT-REQUIRED': encodePaymentRequiredHeader({
              x402Version: 2,
              resource: {
                url,
                description: 'Metered test',
                mimeType: 'application/json',
              },
              accepts: [requirement],
            }),
          },
        });
      }
      options.onPaid?.();
      await options.waitForSettlement;
      const actual = options.actual ?? '1000';
      const receipt = options.receipt ?? {
        success: true,
        network,
        amount: actual,
        transaction: actual === '0' ? '' : '0x' + 'ab'.repeat(32),
      };
      return new Response('result', {
        status: options.paidStatus ?? 200,
        headers: {
          'PAYMENT-RESPONSE':
            typeof receipt === 'string'
              ? receipt
              : encodePaymentResponseHeader(
                  receipt as Parameters<typeof encodePaymentResponseHeader>[0]
                ),
        },
      });
    },
    groups,
    tracker
  );
  const request = (paid = false) =>
    wrapped(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(paid ? { 'PAYMENT-SIGNATURE': 'fixture-credential' } : {}),
      },
      body: JSON.stringify({ input: 'normal work' }),
    });
  return { request, tracker, storage };
}

describe('outgoing upto actual accounting', () => {
  for (const backend of ['memory', 'sqlite'] as const) {
    it.each([
      ['partial', '1000', 402],
      ['zero', '0', 402],
      ['full ceiling', '10000', 403],
    ] as const)(
      'records %s settlement with ' + backend + ' storage',
      async (_name, actual, nextStatus) => {
        let storage: PaymentStorage | undefined;
        if (backend === 'sqlite') {
          const directory = mkdtempSync(
            join(tmpdir(), 'lucid-upto-accounting-')
          );
          directories.push(directory);
          storage = new SQLitePaymentStorage(
            join(directory, 'payments.sqlite')
          );
        }
        const { request, tracker } = fixture({ actual, storage });
        expect((await request()).status).toBe(402);
        expect((await request(true)).status).toBe(200);
        expect(await tracker.getOutgoingTotal('budget', 'global')).toBe(
          BigInt(actual)
        );
        expect(
          (await tracker.getAllData()).map(record => record.amount)
        ).toEqual([BigInt(actual)]);
        expect((await request()).status).toBe(nextStatus);
      }
    );
  }

  it('adjusts recorded amounts without a total-limit reservation', async () => {
    const { request, tracker } = fixture({
      groups: [
        { name: 'budget', outgoingLimits: { global: { maxPaymentUsd: 0.02 } } },
      ],
    });
    await request();
    expect((await request(true)).status).toBe(200);
    expect(await tracker.getOutgoingTotal('budget', 'global')).toBe(1000n);
  });

  it('adjusts every monetary group while keeping a zero-payment rate count', async () => {
    const { request, tracker } = fixture({
      actual: '0',
      groups: [
        {
          name: 'budget',
          outgoingLimits: { global: { maxTotalUsd: 0.015 } },
          rateLimits: { maxPayments: 1, windowMs: 60_000 },
        },
        {
          name: 'per-call',
          outgoingLimits: { global: { maxPaymentUsd: 0.02 } },
        },
      ],
    });
    await request();
    expect((await request(true)).status).toBe(200);
    expect(await tracker.getOutgoingTotal('budget', 'global')).toBe(0n);
    expect(await tracker.getOutgoingTotal('per-call', 'global')).toBe(0n);
    expect((await request()).status).toBe(403);
  });

  it('keeps the ceiling reserved while the remote settlement is in flight', async () => {
    let startPaid!: () => void;
    let finishPaid!: () => void;
    const started = new Promise<void>(resolve => {
      startPaid = resolve;
    });
    const finished = new Promise<void>(resolve => {
      finishPaid = resolve;
    });
    const { request, tracker } = fixture({
      waitForSettlement: finished,
      onPaid: startPaid,
    });
    await request();
    const paid = request(true);
    await started;
    expect(await tracker.getOutgoingTotal('budget', 'global')).toBe(10000n);
    expect((await request()).status).toBe(403);
    finishPaid();
    expect((await paid).status).toBe(200);
    expect(await tracker.getOutgoingTotal('budget', 'global')).toBe(1000n);
    expect((await request()).status).toBe(402);
  });

  it('does not change exact accounting from receipt amount metadata', async () => {
    const { request, tracker } = fixture({ scheme: 'exact', actual: '1000' });
    await request();
    expect((await request(true)).status).toBe(200);
    expect(await tracker.getOutgoingTotal('budget', 'global')).toBe(10000n);
    expect((await request()).status).toBe(403);
  });

  it('releases a definitively failed paid request', async () => {
    const { request, tracker } = fixture({ paidStatus: 500 });
    await request();
    expect((await request(true)).status).toBe(500);
    expect(await tracker.getOutgoingTotal('budget', 'global')).toBe(0n);
    expect((await request()).status).toBe(402);
  });

  it.each([
    ['missing amount', { success: true, network, transaction: 'tx' }],
    [
      'fractional amount',
      { success: true, network, transaction: 'tx', amount: '0.1' },
    ],
    [
      'negative amount',
      { success: true, network, transaction: 'tx', amount: '-1' },
    ],
    [
      'over ceiling',
      { success: true, network, transaction: 'tx', amount: '10001' },
    ],
    [
      'wrong network',
      {
        success: true,
        network: 'eip155:8453',
        transaction: 'tx',
        amount: '1000',
      },
    ],
    [
      'unsuccessful receipt',
      { success: false, network, transaction: 'tx', amount: '1000' },
    ],
    [
      'missing positive transaction',
      { success: true, network, transaction: '', amount: '1000' },
    ],
    ['unreadable receipt', 'not-base64'],
  ] as const)('retains staged capacity for %s', async (_name, receipt) => {
    const { request, tracker } = fixture({ receipt });
    await request();
    expect((await request(true)).status).toBe(503);
    expect(await tracker.getOutgoingTotal('budget', 'global')).toBe(10000n);
    expect(await tracker.getAllData()).toEqual([]);
    expect((await request()).status).toBe(403);
  });

  it('keeps staged capacity if adjusting storage fails after settlement', async () => {
    const { request, tracker, storage } = fixture();
    const failure = spyOn(storage, 'adjustPaymentSettlement').mockRejectedValue(
      new Error('storage unavailable')
    );
    try {
      await request();
      expect((await request(true)).status).toBe(503);
      expect(await tracker.getOutgoingTotal('budget', 'global')).toBe(10000n);
      expect(await tracker.getAllData()).toEqual([]);
    } finally {
      failure.mockRestore();
    }
  });
});
