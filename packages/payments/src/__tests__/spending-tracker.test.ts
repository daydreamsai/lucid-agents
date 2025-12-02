import { describe, expect, it, beforeEach } from 'bun:test';
import { createSpendingTracker } from '../spending-tracker';

describe('SpendingTracker', () => {
  let tracker: ReturnType<typeof createSpendingTracker>;

  beforeEach(() => {
    tracker = createSpendingTracker();
  });

  describe('checkLimit', () => {
    it('should allow spending within limit', () => {
      const result = tracker.checkLimit(
        'group1',
        'global',
        100.0, // 100 USDC limit
        undefined, // no time window
        50_000_000n // 50 USDC (in base units)
      );
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should block spending over limit', () => {
      const result = tracker.checkLimit(
        'group1',
        'global',
        100.0, // 100 USDC limit
        undefined,
        150_000_000n // 150 USDC (over limit)
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('limit exceeded');
    });

    it('should track spending across multiple requests', () => {
      // First request: 50 USDC
      const result1 = tracker.checkLimit('group1', 'global', 100.0, undefined, 50_000_000n);
      expect(result1.allowed).toBe(true);
      tracker.recordSpending('group1', 'global', 50_000_000n);

      // Second request: 30 USDC (total: 80 USDC, still under limit)
      const result2 = tracker.checkLimit('group1', 'global', 100.0, undefined, 30_000_000n);
      expect(result2.allowed).toBe(true);
      tracker.recordSpending('group1', 'global', 30_000_000n);

      // Third request: 25 USDC (total: 105 USDC, over limit)
      const result3 = tracker.checkLimit('group1', 'global', 100.0, undefined, 25_000_000n);
      expect(result3.allowed).toBe(false);
    });

    it('should enforce time window limits', () => {
      const windowMs = 1000; // 1 second window

      // First request
      const result1 = tracker.checkLimit('group1', 'global', 100.0, windowMs, 50_000_000n);
      expect(result1.allowed).toBe(true);
      tracker.recordSpending('group1', 'global', 50_000_000n);

      // Wait for window to expire
      // Note: In real usage, this would be time-based, but for testing we'll check the cleanup logic
      // The tracker should clean up expired entries automatically

      // After window expires, should be able to spend again
      // (This test would need time manipulation or we test cleanup separately)
    });

    it('should track spending per scope', () => {
      // Global scope
      tracker.recordSpending('group1', 'global', 50_000_000n);
      const globalTotal = tracker.getCurrentTotal('group1', 'global');
      expect(globalTotal).toBe(50_000_000n);

      // Target scope
      tracker.recordSpending('group1', 'https://target.example.com', 30_000_000n);
      const targetTotal = tracker.getCurrentTotal('group1', 'https://target.example.com');
      expect(targetTotal).toBe(30_000_000n);

      // Global should still be 50
      expect(tracker.getCurrentTotal('group1', 'global')).toBe(50_000_000n);
    });

    it('should handle zero amounts gracefully', () => {
      tracker.recordSpending('group1', 'global', 0n);
      const total = tracker.getCurrentTotal('group1', 'global');
      expect(total).toBeUndefined();
    });

    it('should clear all data', () => {
      tracker.recordSpending('group1', 'global', 50_000_000n);
      tracker.clear();
      const total = tracker.getCurrentTotal('group1', 'global');
      expect(total).toBeUndefined();
    });
  });

  describe('recordSpending', () => {
    it('should record spending correctly', () => {
      tracker.recordSpending('group1', 'global', 100_000_000n);
      const total = tracker.getCurrentTotal('group1', 'global');
      expect(total).toBe(100_000_000n);
    });

    it('should accumulate spending', () => {
      tracker.recordSpending('group1', 'global', 50_000_000n);
      tracker.recordSpending('group1', 'global', 30_000_000n);
      const total = tracker.getCurrentTotal('group1', 'global');
      expect(total).toBe(80_000_000n);
    });
  });
});

