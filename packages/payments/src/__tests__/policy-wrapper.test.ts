import { describe, expect, it, beforeEach } from 'bun:test';
import type { PaymentPolicyGroup } from '@lucid-agents/types/payments';
import { wrapBaseFetchWithPolicy } from '../policy-wrapper';
import { createPaymentTracker } from '../payment-tracker';
import { createInMemoryPaymentStorage } from '../in-memory-payment-storage';
import { createRateLimiter } from '../rate-limiter';

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

const buildPaymentRequiredHeader = (details: {
  price: string;
  payTo: string;
  network?: string;
}) =>
  Buffer.from(JSON.stringify({ x402Version: 2, ...details })).toString('base64');

const buildPaymentResponseHeader = (details: Record<string, unknown> = {}) =>
  Buffer.from(JSON.stringify(details)).toString('base64');

describe('wrapBaseFetchWithPolicy', () => {
  let baseFetch: FetchLike;
  let paymentTracker: ReturnType<typeof createPaymentTracker>;
  let rateLimiter: ReturnType<typeof createRateLimiter>;
  let policyGroups: PaymentPolicyGroup[];

  beforeEach(() => {
    const storage = createInMemoryPaymentStorage();
    paymentTracker = createPaymentTracker(storage);
    rateLimiter = createRateLimiter();
    policyGroups = [
      {
        name: 'test-policy',
        outgoingLimits: {
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
      paymentTracker,
      rateLimiter
    );

    const response = await wrappedFetch('https://example.com');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ ok: true });
  });

  it('should block 402 responses that violate policies', async () => {
    baseFetch = async () => {
      return new Response(JSON.stringify({ error: 'Payment required' }), {
        status: 402,
        headers: {
          'Content-Type': 'application/json',
          'PAYMENT-REQUIRED': buildPaymentRequiredHeader({
            price: '15.0', // 15 USDC (over 10 USDC limit)
            payTo: '0x123...',
          }),
        },
      });
    };

    const wrappedFetch = wrapBaseFetchWithPolicy(
      baseFetch,
      policyGroups,
      paymentTracker,
      rateLimiter
    );

    const response = await wrappedFetch('https://example.com');
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error.code).toBe('policy_violation');
    expect(data.error.message).toContain('outgoing');
  });

  it('should allow 402 responses that pass policies', async () => {
    baseFetch = async () => {
      return new Response(JSON.stringify({ error: 'Payment required' }), {
        status: 402,
        headers: {
          'Content-Type': 'application/json',
          'PAYMENT-REQUIRED': buildPaymentRequiredHeader({
            price: '5.0', // 5 USDC (under 10 USDC limit)
            payTo: '0x123...',
          }),
        },
      });
    };

    const wrappedFetch = wrapBaseFetchWithPolicy(
      baseFetch,
      policyGroups,
      paymentTracker,
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
        return new Response(JSON.stringify({ error: 'Payment required' }), {
          status: 402,
          headers: {
            'PAYMENT-REQUIRED': buildPaymentRequiredHeader({
              price: '5.0',
              payTo: '0x123...',
            }),
          },
        });
      }
      // Second call: successful payment
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'PAYMENT-RESPONSE': buildPaymentResponseHeader({
            success: true,
            payer: '0xpayer',
          }),
        },
      });
    };

    const wrappedFetch = wrapBaseFetchWithPolicy(
      baseFetch,
      policyGroups,
      paymentTracker,
      rateLimiter
    );

    // First call (402) - should pass through
    const response1 = await wrappedFetch('https://example.com');
    expect(response1.status).toBe(402);

    // Second call (success) - should record
    const response2 = await wrappedFetch('https://example.com');
    expect(response2.status).toBe(200);

    const total = await paymentTracker.getOutgoingTotal(
      'test-policy',
      'global'
    );
    expect(total).toBeDefined();
    expect(Number(total) / 1_000_000).toBe(5.0);
  });

  it('should extract domain from URL for recipient matching', async () => {
    const blockingPolicy: PaymentPolicyGroup[] = [
      {
        name: 'blocker',
        blockedRecipients: ['https://blocked.example.com'],
      },
    ];

    baseFetch = async () => {
      return new Response(JSON.stringify({ error: 'Payment required' }), {
        status: 402,
        headers: {
          'PAYMENT-REQUIRED': buildPaymentRequiredHeader({
            price: '1.0',
            payTo: '0x123...',
          }),
        },
      });
    };

    const wrappedFetch = wrapBaseFetchWithPolicy(
      baseFetch,
      blockingPolicy,
      paymentTracker,
      rateLimiter
    );

    const response = await wrappedFetch('https://blocked.example.com/api');
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error.code).toBe('policy_violation');
  });

  describe('scope resolution for outgoing limits', () => {
    beforeEach(async () => {
      await paymentTracker.clear();
    });

    it('should use endpoint URL scope when perEndpoint limit matches', async () => {
      const endpointUrl =
        'https://agent.example.com/entrypoints/process/invoke';
      policyGroups = [
        {
          name: 'endpoint-policy',
          outgoingLimits: {
            perEndpoint: {
              [endpointUrl]: {
                maxTotalUsd: 100.0,
              },
            },
          },
        },
      ];

      let callCount = 0;
      baseFetch = async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify({ error: 'Payment required' }), {
            status: 402,
            headers: {
              'PAYMENT-REQUIRED': buildPaymentRequiredHeader({
                price: '5.0',
                payTo: '0x123...',
              }),
            },
          });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'PAYMENT-RESPONSE': buildPaymentResponseHeader({ success: true }),
          },
        });
      };

      const wrappedFetch = wrapBaseFetchWithPolicy(
        baseFetch,
        policyGroups,
        paymentTracker,
        rateLimiter
      );

      await wrappedFetch(endpointUrl, { method: 'GET' });
      await wrappedFetch(endpointUrl, { method: 'GET' });

      const total = await paymentTracker.getOutgoingTotal(
        'endpoint-policy',
        endpointUrl
      );
      expect(total).toBeDefined();
      expect(Number(total) / 1_000_000).toBe(5.0);
    });

    it('should use target domain scope when perTarget limit matches', async () => {
      const targetUrl = 'https://agent.example.com';
      const endpointUrl = `${targetUrl}/entrypoints/process/invoke`;
      policyGroups = [
        {
          name: 'target-policy',
          outgoingLimits: {
            perTarget: {
              [targetUrl]: {
                maxTotalUsd: 100.0,
              },
            },
          },
        },
      ];

      let callCount = 0;
      baseFetch = async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify({ error: 'Payment required' }), {
            status: 402,
            headers: {
              'PAYMENT-REQUIRED': buildPaymentRequiredHeader({
                price: '5.0',
                payTo: '0x123...',
              }),
            },
          });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'PAYMENT-RESPONSE': buildPaymentResponseHeader({ success: true }),
          },
        });
      };

      const wrappedFetch = wrapBaseFetchWithPolicy(
        baseFetch,
        policyGroups,
        paymentTracker,
        rateLimiter
      );

      await wrappedFetch(endpointUrl, { method: 'GET' });
      await wrappedFetch(endpointUrl, { method: 'GET' });

      const normalizedKey = targetUrl.trim().toLowerCase().replace(/\/+$/, '');
      const total = await paymentTracker.getOutgoingTotal(
        'target-policy',
        normalizedKey
      );
      expect(total).toBeDefined();
      expect(Number(total) / 1_000_000).toBe(5.0);
    });

    it('should use global scope when only global limit exists', async () => {
      const endpointUrl =
        'https://agent.example.com/entrypoints/process/invoke';
      policyGroups = [
        {
          name: 'global-policy',
          outgoingLimits: {
            global: {
              maxTotalUsd: 100.0,
            },
          },
        },
      ];

      let callCount = 0;
      baseFetch = async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify({ error: 'Payment required' }), {
            status: 402,
            headers: {
              'PAYMENT-REQUIRED': buildPaymentRequiredHeader({
                price: '5.0',
                payTo: '0x123...',
              }),
            },
          });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'PAYMENT-RESPONSE': buildPaymentResponseHeader({ success: true }),
          },
        });
      };

      const wrappedFetch = wrapBaseFetchWithPolicy(
        baseFetch,
        policyGroups,
        paymentTracker,
        rateLimiter
      );

      await wrappedFetch(endpointUrl, { method: 'GET' });
      await wrappedFetch(endpointUrl, { method: 'GET' });

      const total = await paymentTracker.getOutgoingTotal(
        'global-policy',
        'global'
      );
      expect(total).toBeDefined();
      expect(Number(total) / 1_000_000).toBe(5.0);
    });

    it('should use endpoint scope when both endpoint and target limits exist (endpoint takes precedence)', async () => {
      const targetUrl = 'https://agent.example.com';
      const endpointUrl = `${targetUrl}/entrypoints/process/invoke`;
      policyGroups = [
        {
          name: 'multi-policy',
          outgoingLimits: {
            perEndpoint: {
              [endpointUrl]: {
                maxTotalUsd: 50.0,
              },
            },
            perTarget: {
              [targetUrl]: {
                maxTotalUsd: 100.0,
              },
            },
            global: {
              maxTotalUsd: 200.0,
            },
          },
        },
      ];

      let callCount = 0;
      baseFetch = async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify({ error: 'Payment required' }), {
            status: 402,
            headers: {
              'PAYMENT-REQUIRED': buildPaymentRequiredHeader({
                price: '5.0',
                payTo: '0x123...',
              }),
            },
          });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'PAYMENT-RESPONSE': buildPaymentResponseHeader({ success: true }),
          },
        });
      };

      const wrappedFetch = wrapBaseFetchWithPolicy(
        baseFetch,
        policyGroups,
        paymentTracker,
        rateLimiter
      );

      await wrappedFetch(endpointUrl, { method: 'GET' });
      await wrappedFetch(endpointUrl, { method: 'GET' });

      const endpointTotal = await paymentTracker.getOutgoingTotal(
        'multi-policy',
        endpointUrl
      );
      expect(endpointTotal).toBeDefined();
      expect(Number(endpointTotal) / 1_000_000).toBe(5.0);

      const normalizedTarget = targetUrl.toLowerCase().replace(/\/+$/, '');
      const targetTotal = await paymentTracker.getOutgoingTotal(
        'multi-policy',
        normalizedTarget
      );
      expect(targetTotal).toBe(0n);
    });
  });
});
