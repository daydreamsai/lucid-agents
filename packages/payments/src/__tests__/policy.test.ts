import type { PaymentPolicyGroup } from '@lucid-agents/types/payments';
import { beforeEach, describe, expect, it } from 'bun:test';

import { createInMemoryPaymentStorage } from '../in-memory-payment-storage';
import { createPaymentTracker } from '../payment-tracker';
import {
  evaluateOutgoingLimits,
  evaluatePolicyGroups,
  evaluateRateLimit,
  evaluateRecipient,
} from '../policy';
import { createRateLimiter } from '../rate-limiter';

describe('Policy Evaluation', () => {
  let paymentTracker: ReturnType<typeof createPaymentTracker>;
  let rateLimiter: ReturnType<typeof createRateLimiter>;

  beforeEach(() => {
    const storage = createInMemoryPaymentStorage();
    paymentTracker = createPaymentTracker(storage);
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

      const result = evaluateRecipient(
        group,
        undefined,
        'not-allowed.example.com'
      );
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

  describe('evaluateOutgoingLimits', () => {
    it('should allow when no outgoing limits configured', async () => {
      const group: PaymentPolicyGroup = {
        name: 'test',
      };

      const result = await evaluateOutgoingLimits(
        group,
        paymentTracker,
        undefined,
        undefined,
        100_000_000n
      );
      expect(result.allowed).toBe(true);
    });

    it('should enforce per-request limit', async () => {
      const group: PaymentPolicyGroup = {
        name: 'test',
        outgoingLimits: {
          global: {
            maxPaymentUsd: 10.0,
          },
        },
      };

      const result = await evaluateOutgoingLimits(
        group,
        paymentTracker,
        undefined,
        undefined,
        15_000_000n
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Per-request outgoing limit exceeded');
    });

    it('should enforce total outgoing limit', async () => {
      const group: PaymentPolicyGroup = {
        name: 'test',
        outgoingLimits: {
          global: {
            maxTotalUsd: 100.0,
          },
        },
      };

      await paymentTracker.recordOutgoing('test', 'global', 80_000_000n);

      const result = await evaluateOutgoingLimits(
        group,
        paymentTracker,
        undefined,
        undefined,
        30_000_000n
      );
      expect(result.allowed).toBe(false);
    });

    it('should prefer endpoint limit over target limit over global', async () => {
      const group: PaymentPolicyGroup = {
        name: 'test',
        outgoingLimits: {
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

      const endpointUrl =
        'https://target.example.com/entrypoints/process/invoke';
      const result = await evaluateOutgoingLimits(
        group,
        paymentTracker,
        'https://target.example.com',
        endpointUrl,
        25_000_000n
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('process/invoke');
    });
  });

  describe('evaluatePolicyGroups', () => {
    it('should pass when all groups pass', async () => {
      const groups: PaymentPolicyGroup[] = [
        {
          name: 'group1',
          outgoingLimits: {
            global: { maxPaymentUsd: 100.0 },
          },
        },
        {
          name: 'group2',
          allowedRecipients: ['https://allowed.example.com'],
        },
      ];

      const result = await evaluatePolicyGroups(
        groups,
        paymentTracker,
        rateLimiter,
        'https://allowed.example.com',
        undefined,
        50_000_000n,
        undefined,
        'allowed.example.com'
      );
      expect(result.allowed).toBe(true);
    });

    it('should fail when any group fails', async () => {
      const groups: PaymentPolicyGroup[] = [
        {
          name: 'group1',
          outgoingLimits: {
            global: { maxPaymentUsd: 10.0 },
          },
        },
        {
          name: 'group2',
          allowedRecipients: ['https://allowed.example.com'],
        },
      ];

      const result = await evaluatePolicyGroups(
        groups,
        paymentTracker,
        rateLimiter,
        'https://allowed.example.com',
        undefined,
        15_000_000n,
        undefined,
        'allowed.example.com'
      );
      expect(result.allowed).toBe(false);
      expect(result.groupName).toBe('group1');
    });
  });
});
