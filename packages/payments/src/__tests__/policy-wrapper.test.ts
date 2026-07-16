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
  Buffer.from(JSON.stringify({ x402Version: 2, ...details })).toString(
    'base64'
  );

const buildPaymentResponseHeader = (details: Record<string, unknown> = {}) =>
  Buffer.from(JSON.stringify(details)).toString('base64');

const paidRetry = (init: RequestInit = {}): RequestInit => {
  const headers = new Headers(init.headers);
  headers.set('PAYMENT-SIGNATURE', 'test-payment-credential');
  return { ...init, headers };
};

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

  it('enforces non-rate policies without an in-memory rate limiter', async () => {
    baseFetch = async () =>
      new Response(JSON.stringify({ error: 'Payment required' }), {
        status: 402,
        headers: {
          'PAYMENT-REQUIRED': buildPaymentRequiredHeader({
            price: '15.0',
            payTo: '0x123...',
          }),
        },
      });

    const wrappedFetch = wrapBaseFetchWithPolicy(
      baseFetch,
      policyGroups,
      paymentTracker
    );

    expect((await wrappedFetch('https://example.com')).status).toBe(403);
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
    const response2 = await wrappedFetch('https://example.com', paidRetry());
    expect(response2.status).toBe(200);

    const total = await paymentTracker.getOutgoingTotal(
      'test-policy',
      'global'
    );
    expect(total).toBeDefined();
    expect(Number(total) / 1_000_000).toBe(5.0);
  });

  it('atomically blocks concurrent 402 challenges above a total cap', async () => {
    policyGroups = [
      {
        name: 'atomic-total',
        outgoingLimits: { global: { maxTotalUsd: 1.5 } },
      },
    ];
    baseFetch = async () =>
      new Response(null, {
        status: 402,
        headers: {
          'PAYMENT-REQUIRED': buildPaymentRequiredHeader({
            price: '1.0',
            payTo: '0x123...',
          }),
        },
      });
    const wrappedFetch = wrapBaseFetchWithPolicy(
      baseFetch,
      policyGroups,
      paymentTracker,
      rateLimiter
    );

    const responses = await Promise.all([
      wrappedFetch('https://example.com/paid'),
      wrappedFetch('https://example.com/paid'),
    ]);

    expect(responses.map(response => response.status).sort()).toEqual([
      402, 403,
    ]);
  });

  it('atomically enforces payment-count limits', async () => {
    policyGroups = [
      {
        name: 'atomic-rate',
        rateLimits: { maxPayments: 1, windowMs: 60_000 },
      },
    ];
    baseFetch = async () =>
      new Response(null, {
        status: 402,
        headers: {
          'PAYMENT-REQUIRED': buildPaymentRequiredHeader({
            price: '1.0',
            payTo: '0x123...',
          }),
        },
      });
    const wrappedFetch = wrapBaseFetchWithPolicy(
      baseFetch,
      policyGroups,
      paymentTracker,
      rateLimiter
    );

    const responses = await Promise.all([
      wrappedFetch('https://example.com/paid'),
      wrappedFetch('https://example.com/paid'),
    ]);

    expect(responses.map(response => response.status).sort()).toEqual([
      402, 403,
    ]);
  });

  it('releases reservations when the paid retry fails', async () => {
    policyGroups = [
      {
        name: 'release-on-failure',
        outgoingLimits: { global: { maxTotalUsd: 1 } },
      },
    ];
    let calls = 0;
    baseFetch = async () => {
      calls += 1;
      if (calls === 2) return new Response(null, { status: 500 });
      return new Response(null, {
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
      policyGroups,
      paymentTracker,
      rateLimiter
    );

    expect((await wrappedFetch('https://example.com/paid')).status).toBe(402);
    expect(
      (await wrappedFetch('https://example.com/paid', paidRetry())).status
    ).toBe(500);
    expect((await wrappedFetch('https://example.com/paid')).status).toBe(402);
  });

  it('correlates concurrent retries by request fingerprint, not FIFO order', async () => {
    policyGroups = [
      {
        name: 'fingerprinted',
        outgoingLimits: { global: { maxTotalUsd: 10 } },
      },
    ];
    baseFetch = async input => {
      const request = input instanceof Request ? input : new Request(input);
      const body = (await request.clone().json()) as {
        id: string;
        amount: string;
      };
      if (!request.headers.has('PAYMENT-SIGNATURE')) {
        return new Response(null, {
          status: 402,
          headers: {
            'PAYMENT-REQUIRED': buildPaymentRequiredHeader({
              price: body.amount,
              payTo: '0x123...',
            }),
          },
        });
      }
      return body.id === 'b'
        ? new Response(null, {
            status: 200,
            headers: {
              'PAYMENT-RESPONSE': buildPaymentResponseHeader({ success: true }),
            },
          })
        : new Response(null, { status: 500 });
    };
    const wrappedFetch = wrapBaseFetchWithPolicy(
      baseFetch,
      policyGroups,
      paymentTracker,
      rateLimiter
    );
    const init = (id: string, amount: string, paid = false): RequestInit => ({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(paid ? { 'PAYMENT-SIGNATURE': 'credential' } : {}),
      },
      body: JSON.stringify({ id, amount }),
    });
    const url = 'https://example.com/same-endpoint';

    expect((await wrappedFetch(url, init('a', '1'))).status).toBe(402);
    expect((await wrappedFetch(url, init('b', '2'))).status).toBe(402);
    expect((await wrappedFetch(url, init('b', '2', true))).status).toBe(200);
    expect((await wrappedFetch(url, init('a', '1', true))).status).toBe(500);

    expect(
      await paymentTracker.getOutgoingTotal('fingerprinted', 'global')
    ).toBe(2_000_000n);
  });

  it('bounds abandoned attempts and releases the evicted reservation', async () => {
    policyGroups = [
      {
        name: 'bounded',
        outgoingLimits: { global: { maxTotalUsd: 1 } },
      },
    ];
    baseFetch = async () =>
      new Response(null, {
        status: 402,
        headers: {
          'PAYMENT-REQUIRED': buildPaymentRequiredHeader({
            price: '1',
            payTo: '0x123...',
          }),
        },
      });
    const wrappedFetch = wrapBaseFetchWithPolicy(
      baseFetch,
      policyGroups,
      paymentTracker,
      rateLimiter,
      { maxOutstandingAttempts: 1 }
    );

    expect(
      (
        await wrappedFetch('https://example.com/paid', {
          method: 'POST',
          body: 'first',
        })
      ).status
    ).toBe(402);
    expect(
      (
        await wrappedFetch('https://example.com/paid', {
          method: 'POST',
          body: 'second',
        })
      ).status
    ).toBe(402);
  });

  it('keeps the attempt bound under concurrent challenges', async () => {
    policyGroups = [
      {
        name: 'concurrent-bound',
        outgoingLimits: { global: { maxPaymentUsd: 10 } },
      },
    ];
    let challengeCalls = 0;
    let releaseChallenges!: () => void;
    const challengesReady = new Promise<void>(resolve => {
      releaseChallenges = resolve;
    });
    baseFetch = async input => {
      const request = input instanceof Request ? input : new Request(input);
      if (request.headers.has('PAYMENT-SIGNATURE')) {
        return new Response(null, {
          status: 200,
          headers: {
            'PAYMENT-RESPONSE': buildPaymentResponseHeader({ success: true }),
          },
        });
      }
      challengeCalls += 1;
      if (challengeCalls === 2) releaseChallenges();
      await challengesReady;
      return new Response(null, {
        status: 402,
        headers: {
          'PAYMENT-REQUIRED': buildPaymentRequiredHeader({
            price: '1',
            payTo: '0x123...',
          }),
        },
      });
    };
    const wrappedFetch = wrapBaseFetchWithPolicy(
      baseFetch,
      policyGroups,
      paymentTracker,
      rateLimiter,
      { maxOutstandingAttempts: 1 }
    );
    const init = (body: string): RequestInit => ({ method: 'POST', body });

    await Promise.all([
      wrappedFetch('https://example.com/paid', init('first')),
      wrappedFetch('https://example.com/paid', init('second')),
    ]);
    await Promise.all([
      wrappedFetch('https://example.com/paid', paidRetry(init('first'))),
      wrappedFetch('https://example.com/paid', paidRetry(init('second'))),
    ]);

    expect(
      await paymentTracker.getOutgoingTotal('concurrent-bound', 'global')
    ).toBe(1_000_000n);
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
      await wrappedFetch(endpointUrl, paidRetry({ method: 'GET' }));

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
      await wrappedFetch(endpointUrl, paidRetry({ method: 'GET' }));

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
      await wrappedFetch(endpointUrl, paidRetry({ method: 'GET' }));

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
      await wrappedFetch(endpointUrl, paidRetry({ method: 'GET' }));

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
