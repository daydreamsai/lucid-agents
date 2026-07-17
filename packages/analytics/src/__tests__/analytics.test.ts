import { createInMemoryPaymentStorage } from '@lucid-agents/payments';
import { createPaymentTracker } from '@lucid-agents/payments';
import { describe, expect, it } from 'bun:test';

import {
  exportToJSON,
  getAnalyticsData,
  getIncomingSummary,
  getOutgoingSummary,
  getSummary,
} from '../api';
import { analytics } from '../extension';

describe('analytics summaries', () => {
  it('binds analytics operations to an installed payment tracker', async () => {
    const extension = analytics();
    expect(extension.requires).toEqual(['payments']);
    expect(() =>
      extension.build({
        runtime: {},
        meta: { name: 'test', version: '1' },
      } as never)
    ).toThrow('requires an enabled payments');

    const tracker = createPaymentTracker(createInMemoryPaymentStorage());
    const slice = await extension.build({
      runtime: { payments: { paymentTracker: tracker } },
      meta: { name: 'test', version: '1' },
    } as never);
    await tracker.recordIncoming('sales', 'global', 3n);

    expect((await slice.analytics.getSummary()).incomingTotal).toBe(3n);
    expect(slice.analytics.exportCSV).toBeFunction();
  });

  it('summarizes incoming and outgoing records with and without a window', async () => {
    const tracker = createPaymentTracker(createInMemoryPaymentStorage());
    await tracker.recordOutgoing('usage', 'global', 2_000_000n);
    await tracker.recordIncoming('sales', 'global', 5_500_000n);

    const outgoing = await getOutgoingSummary(tracker);
    const incoming = await getIncomingSummary(tracker, 60_000);
    const combined = await getSummary(tracker);

    expect(outgoing).toEqual(
      expect.objectContaining({
        outgoingTotal: 2_000_000n,
        incomingTotal: 5_500_000n,
        netTotal: 3_500_000n,
        outgoingCount: 1,
        incomingCount: 1,
        windowStart: undefined,
      })
    );
    expect(incoming.windowStart).toBeNumber();
    expect(incoming.windowEnd).toBeGreaterThanOrEqual(incoming.windowStart!);
    expect(combined.netTotal).toBe(3_500_000n);
  });

  it('filters records outside the requested time window', async () => {
    const now = Date.now();
    const tracker = {
      async getAllData() {
        return [
          {
            id: 1,
            groupName: 'old',
            scope: 'global',
            direction: 'outgoing' as const,
            amount: 9n,
            timestamp: now - 10_000,
          },
          {
            id: 2,
            groupName: 'new',
            scope: 'global',
            direction: 'incoming' as const,
            amount: 4n,
            timestamp: now,
          },
        ];
      },
    };

    const summary = await getOutgoingSummary(
      tracker as Parameters<typeof getOutgoingSummary>[0],
      1_000
    );

    expect(summary.outgoingCount).toBe(0);
    expect(summary.incomingCount).toBe(1);
    expect(summary.netTotal).toBe(4n);
  });

  it('returns combined data and serializes bigint values to JSON', async () => {
    const tracker = createPaymentTracker(createInMemoryPaymentStorage());
    await tracker.recordIncoming('sales', 'global', 1_250_000n);

    const data = await getAnalyticsData(tracker);
    const json = await exportToJSON(tracker);

    expect(data.transactions[0]?.amountUsdc).toBe('1.25');
    expect(data.summary.incomingTotal).toBe(1_250_000n);
    expect(JSON.parse(json)).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({ incomingTotal: '1250000' }),
      })
    );
  });
});
