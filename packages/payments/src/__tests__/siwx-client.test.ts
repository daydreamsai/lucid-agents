import { describe, expect, it } from 'bun:test';
import {
  SIGN_IN_WITH_X,
  buildSIWxSchema,
  parseSIWxHeader,
  type SIWxExtension,
} from '@x402/extensions/sign-in-with-x';
import {
  buildSIWxHeaderValue,
  hasSIWxExtension,
  parseSIWxExtension,
  wrapFetchWithSIWx,
  type SIWxSigner,
} from '../siwx-client';
import { enrichResponseWithSIWxChallenge } from '../siwx-verify';

const extension: SIWxExtension = {
  info: {
    domain: 'test.com',
    uri: 'https://test.com/api',
    version: '1',
    nonce: 'abc12345',
    issuedAt: new Date().toISOString(),
  },
  supportedChains: [{ chainId: 'eip155:84532', type: 'eip191' }],
  schema: buildSIWxSchema(),
};

function challenge(
  status: 401 | 402 = 402,
  declaration: SIWxExtension = extension
): Response {
  const enriched = enrichResponseWithSIWxChallenge(
    {
      x402Version: 2,
      error: status === 402 ? 'Payment required' : 'Authentication required',
      resource: { url: declaration.info.uri },
      accepts: [],
    },
    declaration,
    status
  );
  return Response.json(enriched.body, {
    status,
    headers: enriched.headers,
  });
}

describe('official SIWX client', () => {
  const mockSigner: SIWxSigner = {
    signMessage: async () => '0xsignature',
    getAddress: async () => '0x1234567890abcdef1234567890abcdef12345678',
    getChainId: async () => 'eip155:84532',
  };

  it('detects and parses the extension from PAYMENT-REQUIRED', async () => {
    const response = challenge();

    expect(await hasSIWxExtension(response)).toBe(true);
    expect(await parseSIWxExtension(response)).toEqual(extension);
  });

  it('uses the official body extension field as a fallback', async () => {
    const response = Response.json({
      extensions: { [SIGN_IN_WITH_X]: extension },
    });

    expect(await parseSIWxExtension(response)).toEqual(extension);
  });

  it('does not consume deprecated X-SIWX-EXTENSION or error.siwx wire fields', async () => {
    const legacy = Response.json(
      { error: { siwx: extension } },
      {
        status: 401,
        headers: { 'X-SIWX-EXTENSION': 'legacy' },
      }
    );

    expect(await hasSIWxExtension(legacy)).toBe(false);
  });

  it('encodes a source-compatible payload with the official encoder', () => {
    const payload = {
      ...extension.info,
      ...extension.supportedChains[0],
      address: '0x1234567890abcdef1234567890abcdef12345678',
      signature: '0xsignature',
    };

    expect(parseSIWxHeader(buildSIWxHeaderValue(payload))).toEqual(payload);
  });

  it('passes through success and payment responses without SIWX', async () => {
    const success = await wrapFetchWithSIWx(
      async () => new Response('ok'),
      mockSigner
    )('https://test.com/api');
    const paymentOnly = await wrapFetchWithSIWx(
      async () => new Response('payment', { status: 402 }),
      mockSigner
    )('https://test.com/api');

    expect(success.status).toBe(200);
    expect(paymentOnly.status).toBe(402);
  });

  it('retries official paid and auth-only challenges with SIGN-IN-WITH-X', async () => {
    for (const status of [401, 402] as const) {
      let calls = 0;
      const response = await wrapFetchWithSIWx(async input => {
        calls += 1;
        const request = new Request(input);
        if (calls === 1) return challenge(status);
        expect(request.headers.has('SIGN-IN-WITH-X')).toBe(true);
        expect(request.headers.has('X-SIGN-IN-WITH-X')).toBe(false);
        return new Response('authorized');
      }, mockSigner)('https://test.com/api');

      expect(response.status).toBe(200);
      expect(calls).toBe(2);
    }
  });

  it('emits an official typed payload and signs the official SIWE message', async () => {
    let signedMessage = '';
    let payloadHeader = '';
    const signer: SIWxSigner = {
      ...mockSigner,
      signMessage: async message => {
        signedMessage = message;
        return '0xsignature';
      },
    };
    let calls = 0;

    await wrapFetchWithSIWx(async input => {
      calls += 1;
      const request = new Request(input);
      if (calls === 1) return challenge();
      payloadHeader = request.headers.get('SIGN-IN-WITH-X') ?? '';
      return new Response('authorized');
    }, signer)('https://test.com/api');

    const payload = parseSIWxHeader(payloadHeader);
    expect(payload?.type).toBe('eip191');
    expect(payload?.chainId).toBe('eip155:84532');
    expect(payload?.signature).toBe('0xsignature');
    expect(signedMessage).toContain(
      'test.com wants you to sign in with your Ethereum account:'
    );
  });

  it('preserves a POST Request body through the retry', async () => {
    const bodies: string[] = [];
    let calls = 0;
    const original = new Request('https://test.com/api', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'hello' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await wrapFetchWithSIWx(async input => {
      calls += 1;
      const request = new Request(input);
      bodies.push(await request.text());
      return calls === 1 ? challenge(401) : new Response('authorized');
    }, mockSigner)(original);

    expect(response.status).toBe(200);
    expect(bodies).toEqual(['{"prompt":"hello"}', '{"prompt":"hello"}']);
  });

  it('does not retry when the signer chain was not declared', async () => {
    let calls = 0;
    const otherChainSigner: SIWxSigner = {
      ...mockSigner,
      getChainId: async () => 'eip155:1',
    };

    const response = await wrapFetchWithSIWx(async () => {
      calls += 1;
      return challenge();
    }, otherChainSigner)('https://test.com/api');

    expect(response.status).toBe(402);
    expect(calls).toBe(1);
  });

  it('prevents recursive authentication retries', async () => {
    const authenticated = new Request('https://test.com/api', {
      headers: { 'SIGN-IN-WITH-X': 'already-attempted' },
    });

    await expect(
      wrapFetchWithSIWx(async () => challenge(401), mockSigner)(authenticated)
    ).rejects.toThrow('already attempted');
  });
});
