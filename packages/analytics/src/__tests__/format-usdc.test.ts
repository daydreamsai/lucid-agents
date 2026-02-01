import {
  createInMemoryPaymentStorage,
  createPaymentTracker,
} from '@lucid-agents/payments';
import { describe, expect, it } from 'bun:test';

import { getAllTransactions } from '../api';

describe('formatUsdcAmount (via getAllTransactions)', () => {
  it('formats small amounts correctly', async () => {
    const storage = createInMemoryPaymentStorage();
    const tracker = createPaymentTracker(storage);

    await tracker.recordOutgoing('test', 'global', 1_000_000n);

    const transactions = await getAllTransactions(tracker);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].amountUsdc).toBe('1');
  });

  it('formats amounts with fractional parts correctly', async () => {
    const storage = createInMemoryPaymentStorage();
    const tracker = createPaymentTracker(storage);

    await tracker.recordOutgoing('test', 'global', 1_500_000n);

    const transactions = await getAllTransactions(tracker);
    expect(transactions[0].amountUsdc).toBe('1.5');
  });

  it('removes trailing zeros from fractional parts', async () => {
    const storage = createInMemoryPaymentStorage();
    const tracker = createPaymentTracker(storage);

    await tracker.recordOutgoing('test', 'global', 1_000_000n);

    const transactions = await getAllTransactions(tracker);
    expect(transactions[0].amountUsdc).toBe('1');
    expect(transactions[0].amountUsdc).not.toContain('.0');
  });

  it('preserves precision for very large amounts', async () => {
    const storage = createInMemoryPaymentStorage();
    const tracker = createPaymentTracker(storage);

    const largeAmount = 9_999_999_999_999_999_999n;
    await tracker.recordOutgoing('test', 'global', largeAmount);

    const transactions = await getAllTransactions(tracker);
    const formatted = transactions[0].amountUsdc;

    expect(formatted).toBe('9999999999999.999999');
    expect(formatted).not.toContain('e+');
    expect(formatted).not.toContain('E+');
  });

  it('handles amounts exceeding Number.MAX_SAFE_INTEGER', async () => {
    const storage = createInMemoryPaymentStorage();
    const tracker = createPaymentTracker(storage);

    const veryLargeAmount =
      BigInt(Number.MAX_SAFE_INTEGER) * 1_000_000n + 123_456n;
    await tracker.recordOutgoing('test', 'global', veryLargeAmount);

    const transactions = await getAllTransactions(tracker);
    const formatted = transactions[0].amountUsdc;

    expect(formatted).toContain('.123456');
    expect(formatted).not.toContain('e+');
    expect(formatted).not.toContain('E+');
  });

  it('formats micro-unit amounts correctly', async () => {
    const storage = createInMemoryPaymentStorage();
    const tracker = createPaymentTracker(storage);

    await tracker.recordOutgoing('test', 'global', 1n);

    const transactions = await getAllTransactions(tracker);
    expect(transactions[0].amountUsdc).toBe('0.000001');
  });

  it('formats amounts with all 6 decimal places', async () => {
    const storage = createInMemoryPaymentStorage();
    const tracker = createPaymentTracker(storage);

    await tracker.recordOutgoing('test', 'global', 1_234_567n);

    const transactions = await getAllTransactions(tracker);
    expect(transactions[0].amountUsdc).toBe('1.234567');
  });

  it('removes trailing zeros from amounts with fewer than 6 decimals', async () => {
    const storage = createInMemoryPaymentStorage();
    const tracker = createPaymentTracker(storage);

    await tracker.recordOutgoing('test', 'global', 1_200_000n);

    const transactions = await getAllTransactions(tracker);
    expect(transactions[0].amountUsdc).toBe('1.2');
  });

  it('handles multiple transactions with different amounts', async () => {
    const storage = createInMemoryPaymentStorage();
    const tracker = createPaymentTracker(storage);

    await tracker.recordOutgoing('test1', 'global', 1_000_000n);
    await tracker.recordOutgoing('test2', 'global', 2_500_000n);
    await tracker.recordOutgoing('test3', 'global', 999_999n);

    const transactions = await getAllTransactions(tracker);
    expect(transactions).toHaveLength(3);

    const amounts = transactions.map(t => t.amountUsdc).sort();
    expect(amounts).toEqual(['0.999999', '1', '2.5']);
  });

  it('preserves precision for amounts with many significant digits', async () => {
    const storage = createInMemoryPaymentStorage();
    const tracker = createPaymentTracker(storage);

    const preciseAmount = 123_456_789_012_345_678n;
    await tracker.recordOutgoing('test', 'global', preciseAmount);

    const transactions = await getAllTransactions(tracker);
    const formatted = transactions[0].amountUsdc;

    expect(formatted).toBe('123456789012.345678');
    expect(formatted.split('.')[1]).toHaveLength(6);
  });
});
