import { describe, expect, it } from 'bun:test';
import { decodePaymentRequiredHeader } from '@x402/core/http';
import {
  SIGN_IN_WITH_X,
  encodeSIWxHeader,
  type SIWxExtension,
  type SIWxPayload,
} from '@x402/extensions/sign-in-with-x';
import type { EntrypointDef } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import { createPaymentsRuntime } from '../payments';

const config: PaymentsConfig = {
  facilitatorUrl: 'https://facilitator.example.com',
  network: 'eip155:84532',
  payTo: '0x1234567890abcdef1234567890abcdef12345678',
  siwx: {
    enabled: true,
    origin: 'https://public.agent.example.com',
    verify: { skipSignatureVerification: true },
  },
};

const authOnly: EntrypointDef = {
  key: 'profile',
  siwx: {
    authOnly: true,
    statement: 'Sign in to view your profile',
  },
};

function internalRequest(siwx?: string, legacy = false): Request {
  return new Request('http://internal-runtime:8787/profile?view=full', {
    method: 'POST',
    headers: {
      Forwarded: 'host=attacker.example;proto=https',
      Host: 'attacker.example',
      ...(siwx
        ? { [legacy ? 'X-SIGN-IN-WITH-X' : 'SIGN-IN-WITH-X']: siwx }
        : {}),
    },
  });
}

describe('incoming official SIWX authorization', () => {
  it('emits an official auth-only challenge bound only to configured origin', async () => {
    const runtime = createPaymentsRuntime(config)!;

    const authorization = await runtime.authorize(
      internalRequest(),
      authOnly,
      'invoke'
    );

    expect(authorization.authorized).toBe(false);
    if (authorization.authorized) throw new Error('Expected SIWX challenge');
    expect(authorization.response.status).toBe(401);
    expect(authorization.response.headers.has('X-SIWX-EXTENSION')).toBe(false);
    const required = decodePaymentRequiredHeader(
      authorization.response.headers.get('PAYMENT-REQUIRED')!
    );
    const extension = required.extensions?.[SIGN_IN_WITH_X] as SIWxExtension;
    expect(extension.info.domain).toBe('public.agent.example.com');
    expect(extension.info.uri).toBe(
      'https://public.agent.example.com/profile?view=full'
    );
    expect(extension.info.statement).toBe('Sign in to view your profile');
    expect(extension.supportedChains).toEqual([
      { chainId: 'eip155:84532', type: 'eip191' },
    ]);
    expect(required.accepts).toEqual([]);
    expect(await authorization.response.clone().json()).toEqual(
      expect.objectContaining({
        error: {
          code: 'auth_required',
          message: 'Wallet authentication required',
        },
        extensions: {
          [SIGN_IN_WITH_X]: extension,
        },
      })
    );
    await runtime.close();
  });

  it('accepts the official proof and preserves AgentAuthContext', async () => {
    const runtime = createPaymentsRuntime(config)!;
    const challenge = await runtime.authorize(
      internalRequest(),
      authOnly,
      'invoke'
    );
    if (challenge.authorized) throw new Error('Expected SIWX challenge');
    const required = decodePaymentRequiredHeader(
      challenge.response.headers.get('PAYMENT-REQUIRED')!
    );
    const extension = required.extensions?.[SIGN_IN_WITH_X] as SIWxExtension;
    const chain = extension.supportedChains[0]!;
    const payload: SIWxPayload = {
      ...extension.info,
      ...chain,
      address: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
      signature: '0xtest-signature',
    };

    const authorized = await runtime.authorize(
      internalRequest(encodeSIWxHeader(payload)),
      authOnly,
      'invoke'
    );

    expect(authorized.authorized).toBe(true);
    if (!authorized.authorized) throw new Error('Expected SIWX authorization');
    expect(authorized.subject).toBe(
      'siwx:eip155:84532:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    );
    expect(authorized.auth).toEqual({
      scheme: 'siwx',
      address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      chainId: 'eip155:84532',
      grantedBy: 'auth-only',
      payload,
    });
    await runtime.close();
  });

  it('does not accept the deprecated X-SIGN-IN-WITH-X request header', async () => {
    const runtime = createPaymentsRuntime(config)!;
    const response = await runtime.authorize(
      internalRequest('legacy-payload', true),
      authOnly,
      'invoke'
    );

    expect(response.authorized).toBe(false);
    if (response.authorized) throw new Error('Expected challenge');
    expect(response.response.status).toBe(401);
    expect(response.response.headers.has('PAYMENT-REQUIRED')).toBe(true);
    await runtime.close();
  });

  it('reuses an MPP-funded entitlement through the official SIWX proof', async () => {
    const runtime = createPaymentsRuntime(config)!;
    const paidEntrypoint: EntrypointDef = {
      key: 'report',
      price: '1',
      paymentProtocol: 'mpp',
      siwx: { enabled: true },
    };
    const requestUrl = 'http://internal-runtime:8787/report';
    const payer = '0x1234567890abcdef1234567890abcdef12345678';
    const paid = await runtime.authorize(
      new Request(requestUrl, { method: 'POST' }),
      paidEntrypoint,
      'invoke',
      {
        protocol: 'mpp',
        payer,
        amount: '1',
        currency: 'usd',
        network: 'eip155:84532',
      }
    );
    if (!paid.authorized) throw new Error('Expected verified MPP payment');
    const admission = await paid.admit();
    if (!admission.admitted) throw new Error('Expected MPP admission');
    expect((await admission.finalize(Response.json({ ok: true }))).status).toBe(
      200
    );

    const payload: SIWxPayload = {
      domain: 'public.agent.example.com',
      address: payer,
      uri: 'https://public.agent.example.com/report',
      version: '1',
      chainId: 'eip155:84532',
      type: 'eip191',
      nonce: 'mppentitlementnonce',
      issuedAt: new Date().toISOString(),
      signature: '0xtest-signature',
    };
    const reused = await runtime.authorize(
      new Request(requestUrl, {
        method: 'POST',
        headers: {
          'SIGN-IN-WITH-X': encodeSIWxHeader(payload),
        },
      }),
      paidEntrypoint,
      'invoke'
    );

    expect(reused.authorized).toBe(true);
    if (!reused.authorized) throw new Error('Expected entitlement reuse');
    expect(reused.auth?.grantedBy).toBe('entitlement');
    expect(reused.auth?.address).toBe(payer);
    await runtime.close();
  });
});
