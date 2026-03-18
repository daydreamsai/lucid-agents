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

    it('should clear data for multiple groups', () => {
      limiter.recordPayment('group1');
      limiter.recordPayment('group2');
      limiter.recordPayment('group3');

      expect(limiter.getCurrentCount('group1', 3600000)).toBe(1);
      expect(limiter.getCurrentCount('group2', 3600000)).toBe(1);
      expect(limiter.getCurrentCount('group3', 3600000)).toBe(1);

      limiter.clear();

      expect(limiter.getCurrentCount('group1', 3600000)).toBe(0);
      expect(limiter.getCurrentCount('group2', 3600000)).toBe(0);
      expect(limiter.getCurrentCount('group3', 3600000)).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle zero window size', () => {
      limiter.recordPayment('group1');
      const count = limiter.getCurrentCount('group1', 0);
      expect(count).toBe(0); // Zero window means nothing is in window
    });

    it('should handle very large window size', () => {
      limiter.recordPayment('group1');
      const count = limiter.getCurrentCount('group1', Number.MAX_SAFE_INTEGER);
      expect(count).toBe(1);
    });

    it('should handle rapid successive payments', () => {
      const maxPayments = 100;
      const windowMs = 1000;

      // Record 100 payments rapidly
      for (let i = 0; i < maxPayments; i++) {
        limiter.recordPayment('group1');
      }

      const count = limiter.getCurrentCount('group1', windowMs);
      expect(count).toBe(maxPayments);

      // 101st should be blocked
      const result = limiter.checkLimit('group1', maxPayments, windowMs);
      expect(result.allowed).toBe(false);
    });

    it('should handle group names with special characters', () => {
      const specialGroups = [
        'group:with:colons',
        'group-with-dashes',
        'group_with_underscores',
        'group.with.dots',
        'group/with/slashes',
      ];

      specialGroups.forEach(group => {
        limiter.recordPayment(group);
        const count = limiter.getCurrentCount(group, 3600000);
        expect(count).toBe(1);
      });
    });

    it('should handle empty group name', () => {
      limiter.recordPayment('');
      const count = limiter.getCurrentCount('', 3600000);
      expect(count).toBe(1);
    });

    it('should handle concurrent access simulation', () => {
      const groupName = 'concurrent-group';
      const payments = 10;

      // Simulate concurrent payments
      for (let i = 0; i < payments; i++) {
        limiter.recordPayment(groupName);
      }

      const count = limiter.getCurrentCount(groupName, 3600000);
      expect(count).toBe(payments);
    });

    it('should handle rate limit of 0 (no payments allowed)', () => {
      const result = limiter.checkLimit('group1', 0, 3600000);
      expect(result.allowed).toBe(false);
    });

    it('should handle rate limit of 1 correctly', () => {
      const maxPayments = 1;
      const windowMs = 3600000;

      // First payment should be allowed
      const result1 = limiter.checkLimit('group1', maxPayments, windowMs);
      expect(result1.allowed).toBe(true);

      limiter.recordPayment('group1');

      // Second payment should be blocked
      const result2 = limiter.checkLimit('group1', maxPayments, windowMs);
      expect(result2.allowed).toBe(false);
    });

    it('should handle multiple groups independently with time windows', async () => {
      const maxPayments = 2;
      const windowMs = 50;

      // Record payments for group1
      limiter.recordPayment('group1');
      limiter.recordPayment('group1');

      // Record payment for group2
      limiter.recordPayment('group2');

      // group1 should be at limit
      expect(limiter.checkLimit('group1', maxPayments, windowMs).allowed).toBe(
        false
      );

      // group2 should have room
      expect(limiter.checkLimit('group2', maxPayments, windowMs).allowed).toBe(
        true
      );

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, windowMs + 10));

      // Both should be allowed now
      expect(limiter.checkLimit('group1', maxPayments, windowMs).allowed).toBe(
        true
      );
      expect(limiter.checkLimit('group2', maxPayments, windowMs).allowed).toBe(
        true
      );
    });
  });
});

