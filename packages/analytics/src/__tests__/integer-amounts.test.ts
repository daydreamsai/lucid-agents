import { describe, expect, it } from 'bun:test';
import {
  createInMemoryPaymentStorage,
  createPaymentTracker,
} from '@lucid-agents/payments';
import {
  exportToCSV,
  exportToJSON,
  getAllTransactions,
  getSummary,
} from '../api';

describe('USDC transaction amounts', () => {
  it.each([
    ['0', 0n],
    ['10', 10_000_000n],
    ['20', 20_000_000n],
    ['100', 100_000_000n],
    ['1000', 1_000_000_000n],
    ['10000000000000000', 10_000_000_000_000_000_000_000n],
    ['1.25', 1_250_000n],
    ['9999999999999.999999', 9_999_999_999_999_999_999n],
  ] as const)(
    'preserves %s in transaction views and exports',
    async (expected, amount) => {
      const tracker = createPaymentTracker(createInMemoryPaymentStorage());
      await tracker.recordOutgoing('format', 'global', amount);

      const transactions = await getAllTransactions(tracker);
      expect(transactions[0]?.amountUsdc).toBe(expected);
      expect(transactions[0]?.amount).toBe(amount);
      expect((await getSummary(tracker)).outgoingTotal).toBe(amount);

      const [header, row] = (await exportToCSV(tracker)).trimEnd().split('\n');
      const amountColumn = header!.split(',').indexOf('amountUsdc');
      expect(row!.split(',')[amountColumn]).toBe(expected);
      expect(JSON.parse(await exportToJSON(tracker))).toMatchObject({
        summary: { outgoingTotal: amount.toString() },
        transactions: [{ amount: amount.toString(), amountUsdc: expected }],
      });
      await tracker.close();
    }
  );

  it('preserves integer digits for incoming payments too', async () => {
    const tracker = createPaymentTracker(createInMemoryPaymentStorage());
    await tracker.recordIncoming('format', 'global', 100_000_000n);
    expect((await getAllTransactions(tracker))[0]?.amountUsdc).toBe('100');
    expect((await getSummary(tracker)).incomingTotal).toBe(100_000_000n);
    await tracker.close();
  });
});
