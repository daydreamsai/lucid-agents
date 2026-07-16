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
      name: 'express-mpp-authorization-test',
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
    const server = app.listen(0);

    try {
      const address = server.address();
      const port =
        typeof address === 'object' && address ? address.port : undefined;
      const response = await fetch(
        `http://127.0.0.1:${port}/entrypoints/paid-mpp/invoke`,
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
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it('executes after the configured verifier accepts the credential', async () => {
    let executions = 0;
    const runtime = await createAgent({
      name: 'express-mpp-verification-test',
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
              receipt: 'express-receipt',
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
    const server = app.listen(0);

    try {
      const address = server.address();
      const port =
        typeof address === 'object' && address ? address.port : undefined;
      const url = `http://127.0.0.1:${port}/entrypoints/verified-mpp/invoke`;
      const challenge = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: {} }),
      });
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: paymentCredential(challenge),
        },
        body: JSON.stringify({ input: {} }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Payment-Receipt')).toBe('express-receipt');
      expect(executions).toBe(1);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
