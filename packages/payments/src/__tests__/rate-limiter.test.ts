import { beforeEach, describe, expect, it } from 'bun:test';

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

    it('should clean up expired entries automatically', async () => {
      const maxPayments = 1;
      const windowMs = 1; // 1ms window

      // Record payment
      limiter.recordPayment('group1');

      // Immediately check - payment should block (still within window)
      const result1 = limiter.checkLimit('group1', maxPayments, windowMs);
      expect(result1.allowed).toBe(false);
      expect(result1.reason).toContain('Rate limit exceeded');

      // Verify count is 1 (payment is still within window)
      expect(limiter.getCurrentCount('group1', windowMs)).toBe(1);

      // Wait for the window to expire (wait 2ms to be safe)
      await new Promise(resolve => setTimeout(resolve, 2));

      // Check again - should allow because entry was cleaned up
      const result2 = limiter.checkLimit('group1', maxPayments, windowMs);
      expect(result2.allowed).toBe(true);
      expect(result2.reason).toBeUndefined();

      // Verify count is 0 after cleanup
      expect(limiter.getCurrentCount('group1', windowMs)).toBe(0);
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
