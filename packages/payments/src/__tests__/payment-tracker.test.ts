import { describe, expect, it, beforeEach } from 'bun:test';
import { createPaymentTracker } from '../payment-tracker';
import { createInMemoryPaymentStorage } from '../in-memory-payment-storage';

describe('PaymentTracker', () => {
  let tracker: ReturnType<typeof createPaymentTracker>;

  beforeEach(() => {
    const storage = createInMemoryPaymentStorage();
    tracker = createPaymentTracker(storage);
  });

  describe('checkOutgoingLimit', () => {
    it('should allow outgoing payment within limit', async () => {
      const result = await tracker.checkOutgoingLimit(
        'group1',
        'global',
        100.0,
        undefined,
        50_000_000n
      );
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should block outgoing payment over limit', async () => {
      const result = await tracker.checkOutgoingLimit(
        'group1',
        'global',
        100.0,
        undefined,
        150_000_000n
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('limit exceeded');
    });

    it('should track outgoing payments across multiple requests', async () => {
      const result1 = await tracker.checkOutgoingLimit(
        'group1',
        'global',
        100.0,
        undefined,
        50_000_000n
      );
      expect(result1.allowed).toBe(true);
      await tracker.recordOutgoing('group1', 'global', 50_000_000n);

      const result2 = await tracker.checkOutgoingLimit(
        'group1',
        'global',
        100.0,
        undefined,
        30_000_000n
      );
      expect(result2.allowed).toBe(true);
      await tracker.recordOutgoing('group1', 'global', 30_000_000n);

      const result3 = await tracker.checkOutgoingLimit(
        'group1',
        'global',
        100.0,
        undefined,
        25_000_000n
      );
      expect(result3.allowed).toBe(false);
    });

    it('should enforce time window limits for getOutgoingTotal', async () => {
      const windowMs = 100;

      await tracker.recordOutgoing('group1', 'global', 50_000_000n);

      let total = await tracker.getOutgoingTotal('group1', 'global', windowMs);
      expect(total).toBe(50_000_000n);

      await new Promise(resolve => setTimeout(resolve, windowMs + 10));

      total = await tracker.getOutgoingTotal('group1', 'global', windowMs);
      expect(total).toBe(0n);
    });

    it('should enforce time window limits for checkOutgoingLimit', async () => {
      const windowMs = 100;
      const maxTotalUsd = 100.0;

      await tracker.recordOutgoing('group1', 'global', 50_000_000n);

      let result = await tracker.checkOutgoingLimit(
        'group1',
        'global',
        maxTotalUsd,
        windowMs,
        30_000_000n
      );
      expect(result.allowed).toBe(true);
      expect(result.currentTotal).toBe(50_000_000n);

      await new Promise(resolve => setTimeout(resolve, windowMs + 10));

      result = await tracker.checkOutgoingLimit(
        'group1',
        'global',
        maxTotalUsd,
        windowMs,
        30_000_000n
      );
      expect(result.allowed).toBe(true);
      expect(result.currentTotal).toBe(0n);
    });

    it('should enforce time window limits for getIncomingTotal', async () => {
      const windowMs = 100;

      await tracker.recordIncoming('group1', 'global', 50_000_000n);

      let total = await tracker.getIncomingTotal('group1', 'global', windowMs);
      expect(total).toBe(50_000_000n);

      await new Promise(resolve => setTimeout(resolve, windowMs + 10));

      total = await tracker.getIncomingTotal('group1', 'global', windowMs);
      expect(total).toBe(0n);
    });

    it('should enforce time window limits for checkIncomingLimit', async () => {
      const windowMs = 100;
      const maxTotalUsd = 100.0;

      await tracker.recordIncoming('group1', 'global', 50_000_000n);

      let result = await tracker.checkIncomingLimit(
        'group1',
        'global',
        maxTotalUsd,
        windowMs,
        30_000_000n
      );
      expect(result.allowed).toBe(true);
      expect(result.currentTotal).toBe(50_000_000n);

      await new Promise(resolve => setTimeout(resolve, windowMs + 10));

      result = await tracker.checkIncomingLimit(
        'group1',
        'global',
        maxTotalUsd,
        windowMs,
        30_000_000n
      );
      expect(result.allowed).toBe(true);
      expect(result.currentTotal).toBe(0n);
    });

    it('should track outgoing payments per scope', async () => {
      await tracker.recordOutgoing('group1', 'global', 50_000_000n);
      const globalTotal = await tracker.getOutgoingTotal('group1', 'global');
      expect(globalTotal).toBe(50_000_000n);

      await tracker.recordOutgoing(
        'group1',
        'https://target.example.com',
        30_000_000n
      );
      const targetTotal = await tracker.getOutgoingTotal(
        'group1',
        'https://target.example.com'
      );
      expect(targetTotal).toBe(30_000_000n);

      expect(await tracker.getOutgoingTotal('group1', 'global')).toBe(
        50_000_000n
      );
    });

    it('should handle zero amounts gracefully', async () => {
      await tracker.recordOutgoing('group1', 'global', 0n);
      const total = await tracker.getOutgoingTotal('group1', 'global');
      expect(total).toBe(0n);
    });

    it('should clear all data', async () => {
      await tracker.recordOutgoing('group1', 'global', 50_000_000n);
      await tracker.clear();
      const total = await tracker.getOutgoingTotal('group1', 'global');
      expect(total).toBe(0n);
    });
  });

  describe('recordOutgoing', () => {
    it('should record outgoing payment correctly', async () => {
      await tracker.recordOutgoing('group1', 'global', 100_000_000n);
      const total = await tracker.getOutgoingTotal('group1', 'global');
      expect(total).toBe(100_000_000n);
    });

    it('should accumulate outgoing payments', async () => {
      await tracker.recordOutgoing('group1', 'global', 50_000_000n);
      await tracker.recordOutgoing('group1', 'global', 30_000_000n);
      const total = await tracker.getOutgoingTotal('group1', 'global');
      expect(total).toBe(80_000_000n);
    });
  });

  describe('recordIncoming', () => {
    it('should record incoming payment correctly', async () => {
      await tracker.recordIncoming('group1', 'global', 100_000_000n);
      const total = await tracker.getIncomingTotal('group1', 'global');
      expect(total).toBe(100_000_000n);
    });

    it('should accumulate incoming payments', async () => {
      await tracker.recordIncoming('group1', 'global', 50_000_000n);
      await tracker.recordIncoming('group1', 'global', 30_000_000n);
      const total = await tracker.getIncomingTotal('group1', 'global');
      expect(total).toBe(80_000_000n);
    });
  });

  describe('checkIncomingLimit', () => {
    it('should allow incoming payment within limit', async () => {
      const result = await tracker.checkIncomingLimit(
        'group1',
        'global',
        100.0,
        undefined,
        50_000_000n
      );
      expect(result.allowed).toBe(true);
    });

    it('should block incoming payment over limit', async () => {
      const result = await tracker.checkIncomingLimit(
        'group1',
        'global',
        100.0,
        undefined,
        150_000_000n
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('limit exceeded');
    });
  });

  describe('group names with colons', () => {
    it('should handle group names containing colons correctly', async () => {
      const groupNameWithColon = 'group:name:with:colons';
      await tracker.recordOutgoing(groupNameWithColon, 'global', 50_000_000n);
      const total = await tracker.getOutgoingTotal(
        groupNameWithColon,
        'global'
      );
      expect(total).toBe(50_000_000n);

      const allRecords = await tracker.getAllData();
      const matchingRecords = allRecords.filter(
        r => r.groupName === groupNameWithColon
      );
      expect(matchingRecords.length).toBe(1);
      expect(matchingRecords[0].direction).toBe('outgoing');
      expect(matchingRecords[0].amount).toBe(50_000_000n);
    });
  });
});
