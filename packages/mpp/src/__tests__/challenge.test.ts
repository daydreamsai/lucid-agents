import { describe, expect, it } from 'bun:test';
import { Challenge, Credential } from 'mppx';

import { buildChallengeResponse } from '../challenge';
import { decodeMppCredential } from '../middleware';

describe('MPP challenge security', () => {
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
  });
});
