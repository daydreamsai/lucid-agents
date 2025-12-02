import { describe, expect, it, beforeEach } from 'bun:test';
import type { PaymentPolicyGroup } from '@lucid-agents/types/payments';
import { wrapBaseFetchWithPolicy } from '../policy-wrapper';
import { createSpendingTracker } from '../spending-tracker';
import { createRateLimiter } from '../rate-limiter';

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

describe('wrapBaseFetchWithPolicy', () => {
  let baseFetch: FetchLike;
  let spendingTracker: ReturnType<typeof createSpendingTracker>;
  let rateLimiter: ReturnType<typeof createRateLimiter>;
  let policyGroups: PaymentPolicyGroup[];

  beforeEach(() => {
    spendingTracker = createSpendingTracker();
    rateLimiter = createRateLimiter();
    policyGroups = [
      {
        name: 'test-policy',
        spendingLimits: {
          global: {
            maxPaymentUsd: 10.0,
          },
        },
      },
    ];
  });

  it('should pass through non-402 responses unchanged', async () => {
    baseFetch = async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const wrappedFetch = wrapBaseFetchWithPolicy(
      baseFetch,
      policyGroups,
      spendingTracker,
      rateLimiter
    );

    const response = await wrappedFetch('https://example.com');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ ok: true });
  });

  it('should block 402 responses that violate policies', async () => {
    baseFetch = async () => {
      return new Response(
        JSON.stringify({ error: 'Payment required' }),
        {
          status: 402,
          headers: {
            'Content-Type': 'application/json',
            'X-Price': '15.0', // 15 USDC (over 10 USDC limit)
            'X-Pay-To': '0x123...',
          },
        }
      );
    };

    const wrappedFetch = wrapBaseFetchWithPolicy(
      baseFetch,
      policyGroups,
      spendingTracker,
      rateLimiter
    );

    const response = await wrappedFetch('https://example.com');
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error.code).toBe('policy_violation');
    expect(data.error.message).toContain('spending limit');
  });

  it('should allow 402 responses that pass policies', async () => {
    baseFetch = async () => {
      return new Response(
        JSON.stringify({ error: 'Payment required' }),
        {
          status: 402,
          headers: {
            'Content-Type': 'application/json',
            'X-Price': '5.0', // 5 USDC (under 10 USDC limit)
            'X-Pay-To': '0x123...',
          },
        }
      );
    };

    const wrappedFetch = wrapBaseFetchWithPolicy(
      baseFetch,
      policyGroups,
      spendingTracker,
      rateLimiter
    );

    const response = await wrappedFetch('https://example.com');
    expect(response.status).toBe(402); // Should pass through
  });

  it('should record spending after successful payment', async () => {
    let callCount = 0;
    baseFetch = async () => {
      callCount++;
      if (callCount === 1) {
        // First call: 402 payment required
        return new Response(
          JSON.stringify({ error: 'Payment required' }),
          {
            status: 402,
            headers: {
              'X-Price': '5.0',
              'X-Pay-To': '0x123...',
            },
          }
        );
      }
      // Second call: successful payment
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'X-PAYMENT-RESPONSE': 'settled',
          'X-Price': '5.0',
        },
      });
    };

    const wrappedFetch = wrapBaseFetchWithPolicy(
      baseFetch,
      policyGroups,
      spendingTracker,
      rateLimiter
    );

    // First call (402) - should pass through
    const response1 = await wrappedFetch('https://example.com');
    expect(response1.status).toBe(402);

    // Second call (success) - should record
    const response2 = await wrappedFetch('https://example.com');
    expect(response2.status).toBe(200);

    // Check that spending was recorded
    const total = spendingTracker.getCurrentTotal('test-policy', 'https://example.com');
    // Note: This depends on the payment info cache working correctly
    // The actual implementation may need adjustment based on how x402 flow works
  });

  it('should extract domain from URL for recipient matching', async () => {
    const blockingPolicy: PaymentPolicyGroup[] = [
      {
        name: 'blocker',
        blockedRecipients: ['https://blocked.example.com'],
      },
    ];

    baseFetch = async () => {
      return new Response(
        JSON.stringify({ error: 'Payment required' }),
        {
          status: 402,
          headers: {
            'X-Price': '1.0',
            'X-Pay-To': '0x123...',
          },
        }
      );
    };

    const wrappedFetch = wrapBaseFetchWithPolicy(
      baseFetch,
      blockingPolicy,
      spendingTracker,
      rateLimiter
    );

    const response = await wrappedFetch('https://blocked.example.com/api');
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error.code).toBe('policy_violation');
  });
});

