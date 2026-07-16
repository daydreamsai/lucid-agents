import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { custom, mpp } from '@lucid-agents/mpp';
import { describe, expect, it } from 'bun:test';
import { Challenge, Credential } from 'mppx';

import { createAgentApp } from '../app';

function paymentCredential(response: Response): string {
  return Credential.serialize({
    challenge: Challenge.fromResponse(response),
    payload: { proof: 'test' },
  });
}

describe('MPP authorization', () => {
  it('rejects an unverified Payment header', async () => {
    let executions = 0;
    const runtime = await createAgent({
      name: 'mpp-authorization-test',
      version: '1.0.0',
    })
      .use(http())
      .use(
        mpp({
          config: {
            methods: [custom.server('test', {})],
            currency: 'usd',
          },
        })
      )
      .addEntrypoint({
        key: 'paid-mpp',
        price: '1000',
        handler: async () => {
          executions += 1;
          return { output: { ok: true } };
        },
      })
      .build();
    const { app } = await createAgentApp(runtime);

    const response = await app.request(
      'http://localhost/entrypoints/paid-mpp/invoke',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Payment not-a-verified-credential',
        },
        body: JSON.stringify({ input: {} }),
      }
    );

    expect(response.status).toBe(402);
    expect(executions).toBe(0);
  });

  it('executes only after the MPP runtime verifies the credential', async () => {
    let executions = 0;
    const runtime = await createAgent({
      name: 'mpp-verification-test',
      version: '1.0.0',
    })
      .use(http())
      .use(
        mpp({
          config: {
            methods: [custom.server('test', {})],
            currency: 'usd',
            verifyCredential: async ({ credential }) => ({
              valid: credential.payload.proof === 'test',
              receipt: 'verified-receipt',
            }),
          },
        })
      )
      .addEntrypoint({
        key: 'verified-mpp',
        price: '1000',
        handler: async () => {
          executions += 1;
          return { output: { ok: true } };
        },
      })
      .build();
    const { app } = await createAgentApp(runtime);

    const challenge = await app.request(
      'http://localhost/entrypoints/verified-mpp/invoke',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: {} }),
      }
    );
    const credential = paymentCredential(challenge);
    const response = await app.request(
      'http://localhost/entrypoints/verified-mpp/invoke',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: credential,
        },
        body: JSON.stringify({ input: {} }),
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Payment-Receipt')).toBe('verified-receipt');
    expect(executions).toBe(1);

    const replay = await app.request(
      'http://localhost/entrypoints/verified-mpp/invoke',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: credential,
        },
        body: JSON.stringify({ input: {} }),
      }
    );
    expect(replay.status).toBe(402);
    expect(executions).toBe(1);
  });

  it('rejects malformed and expired credentials before calling the verifier', async () => {
    let verifierCalls = 0;
    const runtime = await createAgent({
      name: 'mpp-expiry-test',
      version: '1.0.0',
    })
      .use(http())
      .use(
        mpp({
          config: {
            methods: [custom.server('test', {})],
            challengeExpirySeconds: 0,
            verifyCredential: async () => {
              verifierCalls += 1;
              return { valid: true };
            },
          },
        })
      )
      .addEntrypoint({
        key: 'expired-mpp',
        price: '1000',
        handler: async () => ({ output: { ok: true } }),
      })
      .build();
    const { app } = await createAgentApp(runtime);
    const url = 'http://localhost/entrypoints/expired-mpp/invoke';
    const malformed = await app.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Payment arbitrary',
      },
      body: JSON.stringify({ input: {} }),
    });
    expect(malformed.status).toBe(402);

    const challenge = await app.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: {} }),
    });
    const expired = await app.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: paymentCredential(challenge),
      },
      body: JSON.stringify({ input: {} }),
    });
    expect(expired.status).toBe(402);
    expect(verifierCalls).toBe(0);
  });
});
