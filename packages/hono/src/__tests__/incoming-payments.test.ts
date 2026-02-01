import { createInMemoryPaymentStorage } from '@lucid-agents/payments';
import {
  createPaymentTracker,
  extractPayerAddress,
  extractSenderDomain,
  findMostSpecificIncomingLimit,
  parsePriceAmount,
  type PaymentTracker,
} from '@lucid-agents/payments';
import type {
  PaymentPolicyGroup,
  PaymentsConfig,
} from '@lucid-agents/types/payments';
import { beforeEach, describe, expect, it, jest } from 'bun:test';
import type { Context } from 'hono';

describe('Hono Incoming Payment Recording Middleware', () => {
  let paymentTracker: ReturnType<typeof createPaymentTracker>;
  const testPayments: PaymentsConfig = {
    payTo: '0xabc1230000000000000000000000000000000000',
    facilitatorUrl: 'https://facilitator.test',
    network: 'base-sepolia',
    storage: { type: 'in-memory' },
    policyGroups: [
      {
        name: 'test-group-1',
        incomingLimits: {
          global: { maxTotalUsd: 100.0 },
        },
      },
      {
        name: 'test-group-2',
        incomingLimits: {
          global: { maxTotalUsd: 200.0 },
          perSender: {
            '0x1234567890123456789012345678901234567890': {
              maxTotalUsd: 50.0,
            },
          },
        },
      },
    ],
  };

  beforeEach(async () => {
    const storage = createInMemoryPaymentStorage();
    paymentTracker = createPaymentTracker(storage);
  });

  const createMockContext = (
    paymentResponseHeader?: string,
    status: number = 200,
    origin?: string,
    referer?: string
  ): Context => {
    const headers = new Headers();
    if (paymentResponseHeader) {
      headers.set('X-PAYMENT-RESPONSE', paymentResponseHeader);
    }

    const req = {
      header: (name: string) => {
        if (name === 'origin') return origin;
        if (name === 'referer') return referer;
        return undefined;
      },
      url: 'http://agent/entrypoints/test/invoke',
    } as any;

    const res = {
      status,
      headers,
    } as any;

    return {
      req,
      res,
    } as any;
  };

  const createIncomingPaymentMiddleware = (
    policyGroups: PaymentPolicyGroup[],
    tracker: PaymentTracker,
    price: string
  ) => {
    return async (c: Context, next: () => Promise<void>) => {
      await next();

      const paymentResponseHeader = c.res.headers.get('X-PAYMENT-RESPONSE');
      if (paymentResponseHeader && c.res.status >= 200 && c.res.status < 300) {
        try {
          const payerAddress = extractPayerAddress(paymentResponseHeader);
          const senderDomain = extractSenderDomain(
            c.req.header('origin'),
            c.req.header('referer')
          );
          const paymentAmount = parsePriceAmount(price);

          if (payerAddress && paymentAmount !== undefined) {
            for (const group of policyGroups) {
              if (group.incomingLimits) {
                const limitInfo = findMostSpecificIncomingLimit(
                  group.incomingLimits,
                  payerAddress,
                  senderDomain,
                  c.req.url
                );
                const scope = limitInfo?.scope ?? 'global';

                await tracker.recordIncoming(group.name, scope, paymentAmount);
              }
            }
          }
        } catch (error) {
          console.error('[paywall] Error recording incoming payment:', error);
        }
      }
    };
  };

  it('does not record payment when X-PAYMENT-RESPONSE header is missing', async () => {
    const initialTotal1 = await paymentTracker.getIncomingTotal(
      'test-group-1',
      'global'
    );
    const initialTotal2 = await paymentTracker.getIncomingTotal(
      'test-group-2',
      'global'
    );

    const middleware = createIncomingPaymentMiddleware(
      testPayments.policyGroups!,
      paymentTracker,
      '1000'
    );

    const mockContext = createMockContext(undefined, 200);
    await middleware(mockContext, async () => {});

    const total1 = await paymentTracker.getIncomingTotal(
      'test-group-1',
      'global'
    );
    const total2 = await paymentTracker.getIncomingTotal(
      'test-group-2',
      'global'
    );

    expect(total1).toBe(initialTotal1);
    expect(total2).toBe(initialTotal2);
  });

  it('does not record payment for non-2xx status codes', async () => {
    const paymentResponse = Buffer.from(
      JSON.stringify({
        payer: '0x1234567890123456789012345678901234567890',
        settled: true,
      })
    ).toString('base64');

    const initialTotal1 = await paymentTracker.getIncomingTotal(
      'test-group-1',
      'global'
    );
    const initialTotal2 = await paymentTracker.getIncomingTotal(
      'test-group-2',
      'global'
    );

    const middleware = createIncomingPaymentMiddleware(
      testPayments.policyGroups!,
      paymentTracker,
      '1000'
    );

    const mockContext = createMockContext(paymentResponse, 404);
    await middleware(mockContext, async () => {});

    const total1 = await paymentTracker.getIncomingTotal(
      'test-group-1',
      'global'
    );
    const total2 = await paymentTracker.getIncomingTotal(
      'test-group-2',
      'global'
    );

    expect(total1).toBe(initialTotal1);
    expect(total2).toBe(initialTotal2);
  });

  it('handles errors in payment recording gracefully', async () => {
    const paymentResponse = Buffer.from(
      JSON.stringify({
        payer: '0x1234567890123456789012345678901234567890',
        settled: true,
      })
    ).toString('base64');

    const initialTotal = await paymentTracker.getIncomingTotal(
      'test-group-1',
      'global'
    );

    const originalRecordIncoming = paymentTracker.recordIncoming;
    paymentTracker.recordIncoming = async () => {
      throw new Error('Simulated recording error');
    };

    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const middleware = createIncomingPaymentMiddleware(
      testPayments.policyGroups!,
      paymentTracker,
      '1000'
    );

    const mockContext = createMockContext(paymentResponse, 200);
    await middleware(mockContext, async () => {});

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[paywall] Error recording incoming payment:'),
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
    paymentTracker.recordIncoming = originalRecordIncoming;

    const total = await paymentTracker.getIncomingTotal(
      'test-group-1',
      'global'
    );
    expect(total).toBe(initialTotal);
  });
});
