import type { EntrypointDef } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import type { SIWxStorage } from '@lucid-agents/types/siwx';
import { describe, expect, it } from 'bun:test';

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

describe('verified incoming payment authorization', () => {
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
