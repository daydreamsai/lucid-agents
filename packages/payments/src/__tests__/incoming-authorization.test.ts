import type { EntrypointDef } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import type { SIWxStorage } from '@lucid-agents/types/siwx';
import { describe, expect, it } from 'bun:test';

import { createInMemoryPaymentStorage } from '../in-memory-payment-storage';
import type { PaymentStorage } from '../payment-storage';
import { createPaymentsRuntime } from '../payments';

const baseConfig: PaymentsConfig = {
  facilitatorUrl: 'https://facilitator.example.com',
  network: 'eip155:84532',
  payTo: '0x1234567890abcdef1234567890abcdef12345678',
};

const entrypoint: EntrypointDef = {
  key: 'paid',
  price: '1',
  paymentProtocol: 'mpp',
};

function mppRequest(origin?: string): Request {
  return new Request('https://agent.example.com/entrypoints/paid/invoke', {
    method: 'POST',
    headers: origin ? { Origin: origin } : undefined,
  });
}

function x402PaymentSignature(
  response: Response,
  payer: string,
  claimedPayer?: string
): string {
  const required = response.headers.get('PAYMENT-REQUIRED');
  if (!required) throw new Error('Missing PAYMENT-REQUIRED header');
  const challenge = JSON.parse(
    Buffer.from(required, 'base64').toString('utf8')
  ) as {
    x402Version: number;
    resource: Record<string, unknown>;
    accepts: Array<Record<string, unknown>>;
  };
  return Buffer.from(
    JSON.stringify({
      x402Version: challenge.x402Version,
      resource: challenge.resource,
      accepted: challenge.accepts[0],
      ...(claimedPayer ? { payer: claimedPayer } : {}),
      payload: {
        signature: 'test-signature',
        authorization: { from: payer },
      },
    })
  ).toString('base64');
}

async function withFacilitator<T>(
  action: () => Promise<T>,
  options: { failSupported?: () => boolean; network?: string } = {}
): Promise<T> {
  const network = options.network ?? 'eip155:84532';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const rawUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const path = new URL(rawUrl).pathname;
    if (path.endsWith('/supported')) {
      if (options.failSupported?.()) throw new Error('facilitator unavailable');
      return Response.json({
        kinds: [
          {
            x402Version: 2,
            scheme: 'exact',
            network,
            asset: {
              address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
              decimals: 6,
              eip712: { name: 'USDC', version: '2' },
            },
          },
        ],
      });
    }
    if (path.endsWith('/verify')) {
      return Response.json({
        isValid: true,
        payer: '0x1234567890123456789012345678901234567890',
      });
    }
    if (path.endsWith('/settle')) {
      return Response.json({
        success: true,
        payer: '0x1234567890123456789012345678901234567890',
        transaction: '0xtest',
        network,
      });
    }
    return Response.json({ error: 'unexpected request' }, { status: 500 });
  }) as typeof globalThis.fetch;
  try {
    return await action();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

describe('verified incoming payment authorization', () => {
  it('serves and settles x402 challenges through the Fetch authorizer', async () => {
    await withFacilitator(async () => {
      const payer = '0x1234567890123456789012345678901234567890';
      const runtime = createPaymentsRuntime({
        ...baseConfig,
        facilitatorAuth: 'facilitator-token',
      })!;
      const x402Entrypoint: EntrypointDef = {
        key: 'paid-x402',
        description: 'Paid x402 entrypoint',
        price: '0.001',
        paymentProtocol: 'x402',
      };
      const makeRequest = (payment?: string) =>
        new Request(
          'https://agent.example.com/entrypoints/paid-x402/invoke?tag=one&tag=two&single=yes',
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'User-Agent': 'lucid-test',
              ...(payment ? { 'PAYMENT-SIGNATURE': payment } : {}),
            },
          }
        );

      const challenge = await runtime.authorize(
        makeRequest(),
        x402Entrypoint,
        'invoke'
      );
      expect(challenge.authorized).toBe(false);
      if (challenge.authorized) throw new Error('Expected x402 challenge');
      expect(challenge.response.status).toBe(402);
      expect(challenge.response.headers.get('content-type')).toContain(
        'application/json'
      );

      const cachedChallenge = await runtime.authorize(
        makeRequest(),
        x402Entrypoint,
        'invoke'
      );
      expect(cachedChallenge.authorized).toBe(false);

      const signature = x402PaymentSignature(challenge.response, payer);
      const authorization = await runtime.authorize(
        makeRequest(signature),
        x402Entrypoint,
        'invoke'
      );
      expect(authorization.authorized).toBe(true);
      if (!authorization.authorized) throw new Error('Expected paid request');
      expect(authorization.subject).toBe(`payment:eip155:84532:${payer}`);
      const admission = await authorization.admit();
      if (!admission.admitted) throw new Error('Expected paid admission');
      const response = await admission.finalize(
        new Response('settled', {
          headers: { 'X-Application': 'preserved' },
        })
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Application')).toBe('preserved');
      expect(response.headers.get('PAYMENT-RESPONSE')).toBeTruthy();
      await runtime.close();
    });
  });

  it('uses the facilitator-verified payer for sender policies', async () => {
    await withFacilitator(async () => {
      const verifiedPayer = '0x1234567890123456789012345678901234567890';
      const claimedPayer = '0x9999999999999999999999999999999999999999';
      const runtime = createPaymentsRuntime({
        ...baseConfig,
        policyGroups: [
          {
            name: 'verified-sender-only',
            allowedSenders: [claimedPayer],
          },
        ],
      })!;
      const paid: EntrypointDef = {
        key: 'verified-payer',
        price: '0.001',
        paymentProtocol: 'x402',
      };
      const request = (payment?: string) =>
        new Request('https://agent.example.com/verified-payer', {
          method: 'POST',
          headers: payment ? { 'PAYMENT-SIGNATURE': payment } : undefined,
        });

      const challenge = await runtime.authorize(request(), paid, 'invoke');
      if (challenge.authorized) throw new Error('Expected x402 challenge');
      const signature = x402PaymentSignature(
        challenge.response,
        verifiedPayer,
        claimedPayer
      );
      const authorization = await runtime.authorize(
        request(signature),
        paid,
        'invoke'
      );

      expect(authorization.authorized).toBe(true);
      if (!authorization.authorized) throw new Error('Expected verification');
      expect(authorization.subject).toBe(
        `payment:eip155:84532:${verifiedPayer}`
      );
      const admission = await authorization.admit();
      expect(admission.admitted).toBe(false);
      if (admission.admitted) throw new Error('Expected sender rejection');
      expect(admission.response.status).toBe(403);
      await runtime.close();
    });
  });

  it('uses the verified x402 requirement network for identity scoping', async () => {
    const network = 'eip155:8453';
    await withFacilitator(
      async () => {
        const payer = '0x1234567890123456789012345678901234567890';
        const runtime = createPaymentsRuntime(baseConfig)!;
        const paid: EntrypointDef = {
          key: 'network-override',
          price: '0.001',
          paymentProtocol: 'x402',
          network,
        };
        const request = (payment?: string) =>
          new Request('https://agent.example.com/network-override', {
            method: 'POST',
            headers: payment ? { 'PAYMENT-SIGNATURE': payment } : undefined,
          });

        const challenge = await runtime.authorize(request(), paid, 'invoke');
        if (challenge.authorized) throw new Error('Expected x402 challenge');
        const signature = x402PaymentSignature(challenge.response, payer);
        const authorization = await runtime.authorize(
          request(signature),
          paid,
          'invoke'
        );

        expect(authorization.authorized).toBe(true);
        if (!authorization.authorized) throw new Error('Expected verification');
        expect(authorization.subject).toBe(`payment:${network}:${payer}`);
        await runtime.close();
      },
      { network }
    );
  });

  it('adds SIWX declarations to unpaid x402 challenges', async () => {
    await withFacilitator(async () => {
      const runtime = createPaymentsRuntime({
        ...baseConfig,
        siwx: { enabled: true },
      })!;
      const authorization = await runtime.authorize(
        new Request('https://agent.example.com/entrypoints/paid/stream', {
          method: 'POST',
          headers: { Accept: 'text/html' },
        }),
        {
          key: 'paid',
          price: { stream: '0.001' },
          paymentProtocol: 'x402',
          siwx: { enabled: true, statement: 'Sign in to stream' },
        },
        'stream'
      );

      expect(authorization.authorized).toBe(false);
      if (authorization.authorized) throw new Error('Expected challenge');
      expect(authorization.response.status).toBe(402);
      expect(
        authorization.response.headers.get('X-SIWX-EXTENSION')
      ).toBeTruthy();
      const body = await authorization.response.json();
      expect(body.extensions).toBeDefined();
      await runtime.close();
    });
  });

  it('evicts failed x402 server initialization so authorization can retry', async () => {
    let failSupported = true;
    await withFacilitator(
      async () => {
        const runtime = createPaymentsRuntime(baseConfig)!;
        const paid: EntrypointDef = {
          key: 'retry-x402',
          price: '0.001',
          paymentProtocol: 'x402',
        };
        const request = () =>
          new Request('https://agent.example.com/retry', { method: 'POST' });

        const failed = await runtime.authorize(request(), paid, 'invoke');
        expect(failed.authorized).toBe(false);
        if (failed.authorized) throw new Error('Expected initialization error');
        expect(failed.response.status).toBe(503);
        expect(await failed.response.json()).toEqual({
          error: {
            code: 'payment_configuration_error',
            message:
              'Failed to initialize: no supported payment kinds loaded from any facilitator.',
          },
        });

        failSupported = false;
        const retried = await runtime.authorize(request(), paid, 'invoke');
        expect(retried.authorized).toBe(false);
        if (retried.authorized) throw new Error('Expected payment challenge');
        expect(retried.response.status).toBe(402);
        await runtime.close();
      },
      { failSupported: () => failSupported }
    );
  });

  it('records verified payments for non-total incoming policies', async () => {
    const runtime = createPaymentsRuntime({
      ...baseConfig,
      policyGroups: [
        {
          name: 'per-payment-only',
          incomingLimits: { global: { maxPaymentUsd: 2 } },
        },
      ],
    })!;
    const authorization = await runtime.authorize(
      mppRequest(),
      entrypoint,
      'invoke',
      {
        protocol: 'mpp',
        payer: '0xpayer',
        amount: '1',
        currency: 'usdc',
      }
    );
    if (!authorization.authorized) throw new Error('Expected authorization');
    const admission = await authorization.admit();
    if (!admission.admitted) throw new Error('Expected admission');
    expect((await admission.finalize(Response.json({ ok: true }))).status).toBe(
      200
    );
    expect(
      await runtime.paymentTracker?.getIncomingTotal(
        'per-payment-only',
        'global'
      )
    ).toBe(1_000_000n);
    await runtime.close();
  });

  it('returns a no-op admission for free entrypoints', async () => {
    const runtime = createPaymentsRuntime(baseConfig)!;
    const authorization = await runtime.authorize(
      mppRequest(),
      { key: 'free' },
      'invoke'
    );
    if (!authorization.authorized) throw new Error('Expected free entrypoint');
    const admission = await authorization.admit();
    expect(admission.admitted).toBe(true);
    if (!admission.admitted) throw new Error('Expected no-op admission');
    await admission.abort();
    const response = Response.json({ ok: true });
    expect(await admission.finalize(response)).toBe(response);
    await runtime.close();
  });

  it('accepts native-token MPP payments when no USD amount policy applies', async () => {
    const runtime = createPaymentsRuntime(baseConfig)!;
    const authorization = await runtime.authorize(
      mppRequest(),
      entrypoint,
      'invoke',
      {
        protocol: 'mpp',
        payer: '0xpayer',
        amount: '1000000',
        currency: '0x20c0000000000000000000000000000000000001',
        network: 'eip155:42431',
      }
    );

    expect(authorization.authorized).toBe(true);
    if (!authorization.authorized) throw new Error('Expected authorization');
    const admission = await authorization.admit();
    expect(admission.admitted).toBe(true);
    await runtime.close();
  });

  it('does not trust a caller-controlled Origin as sender identity', async () => {
    const runtime = createPaymentsRuntime({
      ...baseConfig,
      policyGroups: [
        {
          name: 'trusted-domain',
          allowedSenders: ['trusted.example.com'],
        },
      ],
    })!;

    const authorization = await runtime.authorize(
      mppRequest('https://trusted.example.com'),
      entrypoint,
      'invoke',
      {
        protocol: 'mpp',
        payer: '0xunlisted',
        amount: '1',
        currency: 'usd',
      }
    );

    expect(authorization.authorized).toBe(true);
    if (!authorization.authorized) {
      throw new Error(
        'Expected the verified payment to reach policy admission'
      );
    }
    const admission = await authorization.admit();
    expect(admission.admitted).toBe(false);
    if (admission.admitted) throw new Error('Expected sender policy rejection');
    expect(admission.response.status).toBe(403);
    await runtime.close();
  });

  it('applies sender, total, and rate policies to verified MPP payments', async () => {
    const payer = '0x0000000000000000000000000000000000000001';
    const runtime = createPaymentsRuntime({
      ...baseConfig,
      policyGroups: [
        {
          name: 'mpp-policy',
          allowedSenders: [payer],
          incomingLimits: { global: { maxTotalUsd: 1.5 } },
          rateLimits: { maxPayments: 1, windowMs: 60_000 },
        },
      ],
    })!;

    const first = await runtime.authorize(mppRequest(), entrypoint, 'invoke', {
      protocol: 'mpp',
      payer,
      amount: '1',
      currency: 'usd',
    });
    expect(first.authorized).toBe(true);
    if (!first.authorized) throw new Error('Expected MPP payment to pass');
    const firstAdmission = await first.admit();
    if (!firstAdmission.admitted) throw new Error('Expected MPP admission');
    expect(
      (await firstAdmission.finalize(Response.json({ ok: true }))).status
    ).toBe(200);
    expect(
      await runtime.paymentTracker?.getIncomingTotal('mpp-policy', 'global')
    ).toBe(1_000_000n);

    const second = await runtime.authorize(mppRequest(), entrypoint, 'invoke', {
      protocol: 'mpp',
      payer,
      amount: '0.25',
      currency: 'usd',
    });
    expect(second.authorized).toBe(true);
    if (!second.authorized) throw new Error('Expected payment verification');
    const secondAdmission = await second.admit();
    expect(secondAdmission.admitted).toBe(false);
    if (secondAdmission.admitted)
      throw new Error('Expected rate limit rejection');
    expect(secondAdmission.response.status).toBe(403);
    await runtime.close();
  });

  it('releases MPP reservations when execution fails', async () => {
    const runtime = createPaymentsRuntime({
      ...baseConfig,
      policyGroups: [
        {
          name: 'one-at-a-time',
          rateLimits: { maxPayments: 1, windowMs: 60_000 },
        },
      ],
    })!;
    const payment = {
      protocol: 'mpp' as const,
      payer: '0xpayer',
      amount: '1',
      currency: 'usd',
    };

    const first = await runtime.authorize(
      mppRequest(),
      entrypoint,
      'invoke',
      payment
    );
    if (!first.authorized) throw new Error('Expected first authorization');
    const firstAdmission = await first.admit();
    if (!firstAdmission.admitted) throw new Error('Expected first admission');
    expect(
      (await firstAdmission.finalize(new Response(null, { status: 500 })))
        .status
    ).toBe(500);

    const retry = await runtime.authorize(
      mppRequest(),
      entrypoint,
      'invoke',
      payment
    );
    expect(retry.authorized).toBe(true);
    await runtime.close();
  });

  it('exposes a stable verified subject and aborts provisional reservations', async () => {
    const runtime = createPaymentsRuntime({
      ...baseConfig,
      policyGroups: [
        {
          name: 'one-at-a-time',
          rateLimits: { maxPayments: 1, windowMs: 60_000 },
        },
      ],
    })!;
    const payment = {
      protocol: 'mpp' as const,
      payer: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
      amount: '1',
      currency: 'usd',
      network: 'eip155:84532',
    };

    const first = await runtime.authorize(
      mppRequest(),
      entrypoint,
      'invoke',
      payment
    );
    if (!first.authorized) throw new Error('Expected first authorization');
    expect(first.subject).toBe(
      'payment:eip155:84532:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    );
    const admission = await first.admit();
    if (!admission.admitted) throw new Error('Expected first admission');
    await admission.abort();

    const retry = await runtime.authorize(
      mppRequest(),
      entrypoint,
      'invoke',
      payment
    );
    expect(retry.authorized).toBe(true);
    await runtime.close();
  });

  it('does not release policy capacity after settlement accounting fails', async () => {
    const originalNow = Date.now;
    let now = 1_000_000;
    Date.now = () => now;
    const delegate = createInMemoryPaymentStorage();
    let releases = 0;
    const storage: PaymentStorage = {
      recordPayment: record => delegate.recordPayment(record),
      getTotal: (...args) => delegate.getTotal(...args),
      getAllRecords: (...args) => delegate.getAllRecords(...args),
      reservePaymentLimit: reservation =>
        delegate.reservePaymentLimit(reservation),
      commitPaymentReservation: id => delegate.commitPaymentReservation(id),
      commitPaymentReservations: (...args) =>
        delegate.commitPaymentReservations(...args),
      stagePaymentSettlement: (...args) =>
        delegate.stagePaymentSettlement(...args),
      commitPaymentSettlement: async () => {
        throw new Error('accounting unavailable');
      },
      releasePaymentSettlement: id => delegate.releasePaymentSettlement(id),
      releasePaymentReservation: async id => {
        releases += 1;
        await delegate.releasePaymentReservation(id);
      },
      clear: () => delegate.clear(),
    };
    const runtime = createPaymentsRuntime(
      {
        ...baseConfig,
        policyGroups: [
          {
            name: 'settled-capacity',
            incomingLimits: { global: { maxTotalUsd: 1 } },
          },
        ],
      },
      undefined,
      () => storage
    )!;
    const payment = {
      protocol: 'mpp' as const,
      payer: '0xpayer',
      amount: '1',
      currency: 'usd',
    };

    try {
      const authorization = await runtime.authorize(
        mppRequest(),
        entrypoint,
        'invoke',
        payment
      );
      if (!authorization.authorized) throw new Error('Expected authorization');
      const admission = await authorization.admit();
      if (!admission.admitted) throw new Error('Expected admission');
      const response = await admission.finalize(Response.json({ ok: true }));

      expect(response.status).toBe(503);
      expect(admission.isCommitted?.()).toBe(true);
      expect(releases).toBe(0);

      const retry = await runtime.authorize(
        mppRequest(),
        entrypoint,
        'invoke',
        payment
      );
      if (!retry.authorized) throw new Error('Expected verified retry');
      const retryAdmission = await retry.admit();
      expect(retryAdmission.admitted).toBe(false);

      now += 5 * 60_000 + 1;
      const expiredRetry = await runtime.authorize(
        mppRequest(),
        entrypoint,
        'invoke',
        payment
      );
      if (!expiredRetry.authorized) throw new Error('Expected verified retry');
      const expiredRetryAdmission = await expiredRetry.admit();
      expect(expiredRetryAdmission.admitted).toBe(false);
    } finally {
      Date.now = originalNow;
      await runtime.close();
    }
  });

  it('contains SIWX storage failures and returns a deterministic error', async () => {
    const storage: SIWxStorage = {
      hasPaid: async () => false,
      recordPayment: async () => {
        throw new Error('entitlement store unavailable');
      },
      hasUsedNonce: async () => false,
      recordNonce: async () => {},
      consumeNonce: async () => 'consumed',
      clear: async () => {},
    };
    const runtime = createPaymentsRuntime(
      { ...baseConfig, siwx: { enabled: true } },
      undefined,
      undefined,
      () => storage
    )!;

    const authorization = await runtime.authorize(
      mppRequest(),
      { ...entrypoint, siwx: { enabled: true } },
      'invoke',
      {
        protocol: 'mpp',
        payer: '0xpayer',
        amount: '1',
        currency: 'usd',
        network: 'eip155:84532',
      }
    );
    if (!authorization.authorized) {
      throw new Error('Expected verified payment authorization');
    }
    const admission = await authorization.admit();
    if (!admission.admitted) {
      throw new Error('Expected verified payment admission');
    }
    const response = await admission.finalize(Response.json({ ok: true }));

    expect(response.status).toBe(503);
    expect(admission.isCommitted?.()).toBe(true);
    expect(await response.json()).toEqual({
      error: {
        code: 'payment_recording_failed',
        message: 'entitlement store unavailable',
      },
    });
    await runtime.close();
  });
});
