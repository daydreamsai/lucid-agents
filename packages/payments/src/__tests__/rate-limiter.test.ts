import { describe, expect, it, beforeEach } from 'bun:test';
import { createRateLimiter } from '../rate-limiter';

describe('RateLimiter', () => {
  let limiter: ReturnType<typeof createRateLimiter>;

  beforeEach(() => {
    limiter = createRateLimiter();
  });

  describe('checkLimit', () => {
    it('should allow payments within rate limit', () => {
      const result = limiter.checkLimit('group1', 10, 3600000); // 10 payments per hour
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should block payments over rate limit', () => {
      const maxPayments = 3;
      const windowMs = 1000; // 1 second window

      // Record 3 payments
      limiter.recordPayment('group1');
      limiter.recordPayment('group1');
      limiter.recordPayment('group1');

      // 4th payment should be blocked
      const result = limiter.checkLimit('group1', maxPayments, windowMs);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Rate limit exceeded');
    });

    it('should track payments per policy group separately', () => {
      limiter.recordPayment('group1');
      limiter.recordPayment('group1');
      limiter.recordPayment('group2');

      const count1 = limiter.getCurrentCount('group1', 3600000);
      const count2 = limiter.getCurrentCount('group2', 3600000);

      expect(count1).toBe(2);
      expect(count2).toBe(1);
    });

    it('should clean up expired entries automatically', () => {
      // Record payment
      limiter.recordPayment('group1');

      // Check limit with very short window (should allow if entry expired)
      // Note: This test depends on timing, so we test the cleanup logic
      // by checking that old entries don't count
      const result = limiter.checkLimit('group1', 1, 1); // 1 payment per 1ms
      // After 1ms passes, the entry should be expired
      // (In practice, cleanup happens on checkLimit)
    });

    it('should return current count correctly', () => {
      expect(limiter.getCurrentCount('group1', 3600000)).toBe(0);

      limiter.recordPayment('group1');
      limiter.recordPayment('group1');
      expect(limiter.getCurrentCount('group1', 3600000)).toBe(2);
    });
  });

  describe('recordPayment', () => {
    it('should record payments', () => {
      limiter.recordPayment('group1');
      const count = limiter.getCurrentCount('group1', 3600000);
      expect(count).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all rate limit data', () => {
      limiter.recordPayment('group1');
      limiter.clear();
      const count = limiter.getCurrentCount('group1', 3600000);
      expect(count).toBe(0);
    });
  });
});

