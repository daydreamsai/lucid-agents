import { describe, expect, it } from 'bun:test';
import { Challenge, Credential } from 'mppx';

import {
  buildChallengeResponse,
  buildChallengeSet,
  mppBaseUnits,
} from '../challenge';
import { custom, evm, stripe, tempo } from '../methods';
import { decodeMppCredential } from '../middleware';

describe('MPP challenge security', () => {
  it('converts display amounts to exact base units', () => {
    expect(mppBaseUnits('1.23', 6)).toBe('1230000');
    expect(mppBaseUnits('1.2300', 2)).toBe('123');
    expect(mppBaseUnits('0', 0)).toBe('0');

    expect(() => mppBaseUnits('1', -1)).toThrow(
      'Invalid MPP currency decimals'
    );
    expect(() => mppBaseUnits('1', 1.5)).toThrow(
      'Invalid MPP currency decimals'
    );
    expect(() => mppBaseUnits('not-an-amount', 2)).toThrow(
      'Invalid MPP amount'
    );
    expect(() => mppBaseUnits('1.234', 2)).toThrow(
      'more than 2 decimal places'
    );
  });

  it('builds method-specific payment requests', async () => {
    const { response } = buildChallengeSet({
      amount: '1.25',
      currency: '0x20c0000000000000000000000000000000000000',
      intent: 'charge',
      methods: [
        tempo.server({
          currency: '0x20c0000000000000000000000000000000000000',
          recipient: '0x0000000000000000000000000000000000000001',
          decimals: 6,
          chainId: 42431,
        }),
        stripe.server({
          secretKey: 'sk_test_example',
          networkId: 'stripe',
          decimals: 2,
          paymentMethodTypes: ['card', 'link'],
          metadata: { environment: 'test' },
        }),
        evm.server({
          chainId: 8453,
          currency: '0x0000000000000000000000000000000000000002',
          recipient: '0x0000000000000000000000000000000000000003',
          decimals: 6,
          authorization: { name: 'USD Coin', version: '2' },
          settlement: {
            type: 'custom',
            settle: async () => ({ reference: '0xsettled' }),
          },
        }),
        custom.server('invoice', { provider: 'example' }),
      ],
      digest: 'sha-256=:example:',
      meta: { operation: 'invoke' },
    });
    const body = (await response.json()) as {
      challenges: Array<{
        method: string;
        request: Record<string, unknown>;
      }>;
    };

    expect(body.challenges.map(challenge => challenge.method)).toEqual([
      'tempo',
      'stripe',
      'evm',
      'invoice',
    ]);
    expect(body.challenges[0]!.request).toMatchObject({
      amount: '1250000',
      recipient: '0x0000000000000000000000000000000000000001',
      methodDetails: { chainId: 42431 },
    });
    expect(body.challenges[1]!.request).toMatchObject({
      amount: '125',
      methodDetails: {
        networkId: 'stripe',
        paymentMethodTypes: ['card', 'link'],
        metadata: { environment: 'test' },
      },
    });
    expect(body.challenges[2]!.request).toMatchObject({
      amount: '1250000',
      recipient: '0x0000000000000000000000000000000000000003',
      methodDetails: {
        chainId: 8453,
        credentialTypes: ['authorization'],
        decimals: 6,
      },
    });
    expect(body.challenges[3]!.request).toMatchObject({
      provider: 'example',
      amount: '1.25',
    });
  });

  it('applies the configured expiry and strips header injection', async () => {
    const before = Date.now();
    const response = buildChallengeResponse({
      amount: '1000',
      currency: 'usd',
      intent: 'charge',
      methods: ['test'],
      description: 'safe\r\nInjected: true',
      expirySeconds: 42,
    });
    const body = (await response.json()) as {
      challenges: Array<{ expires: string }>;
    };
    const expiresAt = Date.parse(body.challenges[0]!.expires);

    expect(expiresAt).toBeGreaterThanOrEqual(before + 41_900);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 42_100);
    expect(response.headers.get('WWW-Authenticate')).not.toContain('\r');
    expect(response.headers.get('WWW-Authenticate')).not.toContain('\n');
  });

  it('accepts only structured base64url credentials with a challenge id', () => {
    expect(
      decodeMppCredential(
        new Request('https://agent.test', {
          headers: { Authorization: 'Bearer arbitrary-secret' },
        })
      )
    ).toBeNull();

    const response = buildChallengeResponse({
      amount: '1',
      currency: 'usd',
      intent: 'charge',
      methods: ['test'],
      realm: 'agent.test',
    });
    const challenge = Challenge.fromResponse(response);
    const authorization = Credential.serialize({
      challenge,
      payload: { proof: true },
      source: 'did:pkh:eip155:1:0xpayer',
    });
    expect(
      decodeMppCredential(
        new Request('https://agent.test', {
          headers: { Authorization: authorization },
        })
      )
    ).toEqual({
      challengeId: challenge.id,
      challenge,
      payload: { proof: true },
      source: 'did:pkh:eip155:1:0xpayer',
    });
    expect(
      decodeMppCredential(
        new Request('https://agent.test', {
          headers: {
            Authorization: `Bearer caller-token, ${authorization}`,
          },
        })
      )
    ).toEqual({
      challengeId: challenge.id,
      challenge,
      payload: { proof: true },
      source: 'did:pkh:eip155:1:0xpayer',
    });
  });
});
