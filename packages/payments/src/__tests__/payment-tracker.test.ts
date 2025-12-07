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
    it('should allow outgoing payment within limit', () => {
      const result = tracker.checkOutgoingLimit(
        'group1',
        'global',
        100.0,
        undefined,
        50_000_000n
      );
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should block outgoing payment over limit', () => {
      const result = tracker.checkOutgoingLimit(
        'group1',
        'global',
        100.0,
        undefined,
        150_000_000n
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('limit exceeded');
    });

    it('should track outgoing payments across multiple requests', () => {
      const result1 = tracker.checkOutgoingLimit(
        'group1',
        'global',
        100.0,
        undefined,
        50_000_000n
      );
      expect(result1.allowed).toBe(true);
      tracker.recordOutgoing('group1', 'global', 50_000_000n);

      const result2 = tracker.checkOutgoingLimit(
        'group1',
        'global',
        100.0,
        undefined,
        30_000_000n
      );
      expect(result2.allowed).toBe(true);
      tracker.recordOutgoing('group1', 'global', 30_000_000n);

      const result3 = tracker.checkOutgoingLimit(
        'group1',
        'global',
        100.0,
        undefined,
        25_000_000n
      );
      expect(result3.allowed).toBe(false);
    });

    it('should enforce time window limits', () => {
      const windowMs = 1000;
      const result1 = tracker.checkOutgoingLimit(
        'group1',
        'global',
        100.0,
        windowMs,
        50_000_000n
      );
      expect(result1.allowed).toBe(true);
      tracker.recordOutgoing('group1', 'global', 50_000_000n);
    });

    it('should track outgoing payments per scope', () => {
      tracker.recordOutgoing('group1', 'global', 50_000_000n);
      const globalTotal = tracker.getOutgoingTotal('group1', 'global');
      expect(globalTotal).toBe(50_000_000n);

      tracker.recordOutgoing(
        'group1',
        'https://target.example.com',
        30_000_000n
      );
      const targetTotal = tracker.getOutgoingTotal(
        'group1',
        'https://target.example.com'
      );
      expect(targetTotal).toBe(30_000_000n);

      expect(tracker.getOutgoingTotal('group1', 'global')).toBe(50_000_000n);
    });

    it('should handle zero amounts gracefully', () => {
      tracker.recordOutgoing('group1', 'global', 0n);
      const total = tracker.getOutgoingTotal('group1', 'global');
      expect(total).toBe(0n);
    });

    it('should clear all data', () => {
      tracker.recordOutgoing('group1', 'global', 50_000_000n);
      tracker.clear();
      const total = tracker.getOutgoingTotal('group1', 'global');
      expect(total).toBe(0n);
    });
  });

  describe('recordOutgoing', () => {
    it('should record outgoing payment correctly', () => {
      tracker.recordOutgoing('group1', 'global', 100_000_000n);
      const total = tracker.getOutgoingTotal('group1', 'global');
      expect(total).toBe(100_000_000n);
    });

    it('should accumulate outgoing payments', () => {
      tracker.recordOutgoing('group1', 'global', 50_000_000n);
      tracker.recordOutgoing('group1', 'global', 30_000_000n);
      const total = tracker.getOutgoingTotal('group1', 'global');
      expect(total).toBe(80_000_000n);
    });
  });

  describe('recordIncoming', () => {
    it('should record incoming payment correctly', () => {
      tracker.recordIncoming('group1', 'global', 100_000_000n);
      const total = tracker.getIncomingTotal('group1', 'global');
      expect(total).toBe(100_000_000n);
    });

    it('should accumulate incoming payments', () => {
      tracker.recordIncoming('group1', 'global', 50_000_000n);
      tracker.recordIncoming('group1', 'global', 30_000_000n);
      const total = tracker.getIncomingTotal('group1', 'global');
      expect(total).toBe(80_000_000n);
    });
  });

  describe('checkIncomingLimit', () => {
    it('should allow incoming payment within limit', () => {
      const result = tracker.checkIncomingLimit(
        'group1',
        'global',
        100.0,
        undefined,
        50_000_000n
      );
      expect(result.allowed).toBe(true);
    });

    it('should block incoming payment over limit', () => {
      const result = tracker.checkIncomingLimit(
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
});
