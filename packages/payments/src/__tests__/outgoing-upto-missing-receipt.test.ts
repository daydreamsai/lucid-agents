import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePaymentRequiredHeader } from '@x402/core/http';
import { createInMemoryPaymentStorage } from '../in-memory-payment-storage';
import { createPaymentTracker } from '../payment-tracker';
import type { PaymentStorage } from '../payment-storage';
import { wrapBaseFetchWithPolicy } from '../policy-wrapper';
import { SQLitePaymentStorage } from '../sqlite-payment-storage';

const trackers: ReturnType<typeof createPaymentTracker>[] = [];
const directories: string[] = [];
afterEach(async () => {
  for (const tracker of trackers.splice(0)) await tracker.close();
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe('successful paid responses without a receipt', () => {
  it.each([
    ['upto', 'memory', 503, 10000n, 403],
    ['upto', 'sqlite', 503, 10000n, 403],
    ['exact', 'memory', 200, 0n, 402],
  ] as const)(
    'handles %s with %s storage',
    async (scheme, backend, status, total, nextStatus) => {
      const url = 'https://example.com/no-receipt';
      let storage: PaymentStorage = createInMemoryPaymentStorage();
      if (backend === 'sqlite') {
        const dir = mkdtempSync(join(tmpdir(), 'lucid-no-receipt-'));
        directories.push(dir);
        storage = new SQLitePaymentStorage(join(dir, 'payments.sqlite'));
      }
      const tracker = createPaymentTracker(storage);
      trackers.push(tracker);
      const wrapped = wrapBaseFetchWithPolicy(
        async input => {
          const request = input instanceof Request ? input : new Request(input);
          if (request.headers.has('PAYMENT-SIGNATURE'))
            return new Response('result');
          return new Response(null, {
            status: 402,
            headers: {
              'PAYMENT-REQUIRED': encodePaymentRequiredHeader({
                x402Version: 2,
                resource: {
                  url,
                  description: 'No receipt test',
                  mimeType: 'text/plain',
                },
                accepts: [
                  {
                    scheme,
                    network: 'eip155:84532',
                    amount: '10000',
                    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
                    payTo: '0x1111111111111111111111111111111111111111',
                    maxTimeoutSeconds: 60,
                    extra: {},
                  },
                ],
              }),
            },
          });
        },
        [
          {
            name: 'budget',
            outgoingLimits: { global: { maxTotalUsd: 0.015 } },
          },
        ],
        tracker
      );
      expect((await wrapped(url)).status).toBe(402);
      expect(
        (
          await wrapped(url, {
            headers: { 'PAYMENT-SIGNATURE': 'fixture-credential' },
          })
        ).status
      ).toBe(status);
      expect(await tracker.getOutgoingTotal('budget', 'global')).toBe(total);
      expect(await tracker.getAllData()).toEqual([]);
      expect((await wrapped(url)).status).toBe(nextStatus);
    }
  );
});
