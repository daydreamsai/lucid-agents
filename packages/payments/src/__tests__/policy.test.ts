import { describe, expect, it, beforeEach } from 'bun:test';
import type { PaymentPolicyGroup } from '@lucid-agents/types/payments';
import {
  evaluateRecipient,
  evaluateRateLimit,
  evaluateSpendingLimits,
  evaluatePolicyGroups,
} from '../policy';
import { createSpendingTracker } from '../spending-tracker';
import { createRateLimiter } from '../rate-limiter';

describe('Policy Evaluation', () => {
  let spendingTracker: ReturnType<typeof createSpendingTracker>;
  let rateLimiter: ReturnType<typeof createRateLimiter>;

  beforeEach(() => {
    spendingTracker = createSpendingTracker();
    rateLimiter = createRateLimiter();
  });

  describe('evaluateRecipient', () => {
    it('should allow recipients not in blacklist', () => {
      const group: PaymentPolicyGroup = {
        name: 'test',
        blockedRecipients: ['https://blocked.example.com'],
      };

      const result = evaluateRecipient(
        group,
        '0x123...',
        'https://allowed.example.com'
      );
      expect(result.allowed).toBe(true);
    });

    it('should block recipients in blacklist (address)', () => {
      const group: PaymentPolicyGroup = {
        name: 'test',
        blockedRecipients: ['0x123...'],
      };

      const result = evaluateRecipient(group, '0x123...');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('blocked');
    });

    it('should block recipients in blacklist (domain)', () => {
      const group: PaymentPolicyGroup = {
        name: 'test',
        blockedRecipients: ['https://blocked.example.com'],
      };

      const result = evaluateRecipient(group, undefined, 'blocked.example.com');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('blocked');
    });

    it('should allow recipients in whitelist', () => {
      const group: PaymentPolicyGroup = {
        name: 'test',
        allowedRecipients: ['https://allowed.example.com'],
      };

      const result = evaluateRecipient(group, undefined, 'allowed.example.com');
      expect(result.allowed).toBe(true);
    });

    it('should block recipients not in whitelist when whitelist exists', () => {
      const group: PaymentPolicyGroup = {
        name: 'test',
        allowedRecipients: ['https://allowed.example.com'],
      };

      const result = evaluateRecipient(group, undefined, 'not-allowed.example.com');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('whitelist');
    });

    it('should prioritize blacklist over whitelist', () => {
      const group: PaymentPolicyGroup = {
        name: 'test',
        allowedRecipients: ['https://example.com'],
        blockedRecipients: ['https://example.com'],
      };

      const result = evaluateRecipient(group, undefined, 'example.com');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('blocked');
    });
  });

  describe('evaluateRateLimit', () => {
    it('should allow when no rate limit configured', () => {
      const group: PaymentPolicyGroup = {
        name: 'test',
      };

      const result = evaluateRateLimit(group, rateLimiter);
      expect(result.allowed).toBe(true);
    });

    it('should enforce rate limits', () => {
      const group: PaymentPolicyGroup = {
        name: 'test',
        rateLimits: {
          maxPayments: 2,
          windowMs: 3600000,
        },
      };

      // Record 2 payments
      rateLimiter.recordPayment('test');
      rateLimiter.recordPayment('test');

      // 3rd should be blocked
      const result = evaluateRateLimit(group, rateLimiter);
      expect(result.allowed).toBe(false);
    });
  });

  describe('evaluateSpendingLimits', () => {
    it('should allow when no spending limits configured', () => {
      const group: PaymentPolicyGroup = {
        name: 'test',
      };

      const result = evaluateSpendingLimits(
        group,
        spendingTracker,
        undefined,
        undefined,
        100_000_000n
      );
      expect(result.allowed).toBe(true);
    });

    it('should enforce per-request limit', () => {
      const group: PaymentPolicyGroup = {
        name: 'test',
        spendingLimits: {
          global: {
            maxPaymentUsd: 10.0, // 10 USDC per request
          },
        },
      };

      const result = evaluateSpendingLimits(
        group,
        spendingTracker,
        undefined,
        undefined,
        15_000_000n // 15 USDC (over limit)
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Per-request spending limit exceeded');
    });

    it('should enforce total spending limit', () => {
      const group: PaymentPolicyGroup = {
        name: 'test',
        spendingLimits: {
          global: {
            maxTotalUsd: 100.0, // 100 USDC total
          },
        },
      };

      // Record some spending
      spendingTracker.recordSpending('test', 'global', 80_000_000n); // 80 USDC

      // Try to spend 30 USDC more (would exceed 100 USDC limit)
      const result = evaluateSpendingLimits(
        group,
        spendingTracker,
        undefined,
        undefined,
        30_000_000n
      );
      expect(result.allowed).toBe(false);
    });

    it('should prefer endpoint limit over target limit over global', () => {
      const group: PaymentPolicyGroup = {
        name: 'test',
        spendingLimits: {
          global: {
            maxPaymentUsd: 100.0,
          },
          perTarget: {
            'https://target.example.com': {
              maxPaymentUsd: 50.0,
            },
          },
          perEndpoint: {
            'https://target.example.com/entrypoints/process/invoke': {
              maxPaymentUsd: 20.0,
            },
          },
        },
      };

      const endpointUrl = 'https://target.example.com/entrypoints/process/invoke';
      const result = evaluateSpendingLimits(
        group,
        spendingTracker,
        'https://target.example.com',
        endpointUrl,
        25_000_000n // 25 USDC (over endpoint limit but under target/global)
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('process/invoke');
    });
  });

  describe('evaluatePolicyGroups', () => {
    it('should pass when all groups pass', () => {
      const groups: PaymentPolicyGroup[] = [
        {
          name: 'group1',
          spendingLimits: {
            global: { maxPaymentUsd: 100.0 },
          },
        },
        {
          name: 'group2',
          allowedRecipients: ['https://allowed.example.com'],
        },
      ];

      const result = evaluatePolicyGroups(
        groups,
        spendingTracker,
        rateLimiter,
        'https://allowed.example.com',
        undefined,
        50_000_000n,
        undefined,
        'allowed.example.com'
      );
      expect(result.allowed).toBe(true);
    });

    it('should fail when any group fails', () => {
      const groups: PaymentPolicyGroup[] = [
        {
          name: 'group1',
          spendingLimits: {
            global: { maxPaymentUsd: 10.0 },
          },
        },
        {
          name: 'group2',
          allowedRecipients: ['https://allowed.example.com'],
        },
      ];

      const result = evaluatePolicyGroups(
        groups,
        spendingTracker,
        rateLimiter,
        'https://allowed.example.com',
        undefined,
        15_000_000n, // Over spending limit
        undefined,
        'allowed.example.com'
      );
      expect(result.allowed).toBe(false);
      expect(result.groupName).toBe('group1');
    });
  });
});

