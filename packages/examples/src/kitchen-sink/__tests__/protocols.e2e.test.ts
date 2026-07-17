import { createAgentApp } from '@lucid-agents/hono';
import { describe, expect, it } from 'bun:test';
import { Challenge, Credential } from 'mppx';

import { createKitchenSinkAgent } from '../agent';
import { registerEntrypoints } from '../entrypoints';

const PAYER = '0x1234567890abcdef1234567890abcdef12345678';

type PaymentRequired = {
  x402Version: number;
  resource: Record<string, unknown>;
  accepts: Array<Record<string, unknown>>;
};

function decodeHeader(value: string): PaymentRequired {
  return JSON.parse(
    Buffer.from(value, 'base64').toString('utf8')
  ) as PaymentRequired;
}

describe('kitchen-sink payment profiles E2E', () => {
  it('settles x402 over HTTP, records analytics, and reuses SIWX entitlement', async () => {
    const calls = { verify: 0, settle: 0 };
    const facilitator = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname;
        if (path.endsWith('/supported')) {
          return Response.json({
            kinds: [
              {
                x402Version: 2,
                scheme: 'exact',
                network: 'eip155:84532',
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
          calls.verify += 1;
          return Response.json({ isValid: true, payer: PAYER });
        }
        if (path.endsWith('/settle')) {
          calls.settle += 1;
          return Response.json({
            success: true,
            payer: PAYER,
            transaction: '0xkitchensink',
            network: 'eip155:84532',
          });
        }
        return Response.json({ error: 'unexpected request' }, { status: 500 });
      },
    });
    if (facilitator.port === undefined)
      throw new Error('Missing facilitator port');

    const runtime = await createKitchenSinkAgent({
      profile: 'x402',
      paymentsConfig: {
        payTo: '0x0000000000000000000000000000000000000001',
        network: 'eip155:84532',
        facilitatorUrl: `http://127.0.0.1:${facilitator.port}`,
        policyGroups: [
          {
            name: 'kitchen-sink-revenue',
            incomingLimits: { global: { maxPaymentUsd: 2_000 } },
          },
        ],
      },
    });
    const agentApp = await createAgentApp(runtime);
    registerEntrypoints(agentApp.addEntrypoint, runtime, { profile: 'x402' });
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: agentApp.app.fetch.bind(agentApp.app),
    });
    if (server.port === undefined) throw new Error('Missing agent port');
    const origin = `http://127.0.0.1:${server.port}`;
    const invoke = (headers?: Record<string, string>) =>
      fetch(`${origin}/entrypoints/summarize/invoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ input: { text: 'paid kitchen sink' } }),
      });

    try {
      const challengeResponse = await invoke();
      expect(challengeResponse.status).toBe(402);
      const challengeHeader = challengeResponse.headers.get('PAYMENT-REQUIRED');
      expect(challengeHeader).toBeTruthy();
      expect((await challengeResponse.json()).extensions?.siwx).toBeDefined();
      const challenge = decodeHeader(challengeHeader!);

      const payment = Buffer.from(
        JSON.stringify({
          x402Version: challenge.x402Version,
          resource: challenge.resource,
          accepted: challenge.accepts[0],
          payload: {
            signature: 'test-signature',
            authorization: { from: PAYER },
          },
        })
      ).toString('base64');
      const paid = await invoke({ 'PAYMENT-SIGNATURE': payment });
      expect(paid.status).toBe(200);
      expect(calls).toEqual({ verify: 1, settle: 1 });

      const report = await fetch(
        `${origin}/entrypoints/analytics-report/invoke`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ input: {} }),
        }
      );
      expect(await report.json()).toMatchObject({
        output: { transactionCount: 1 },
      });

      const siwx = Buffer.from(
        JSON.stringify({
          domain: '127.0.0.1',
          address: PAYER,
          uri: `${origin}/entrypoints/summarize/invoke`,
          version: '1',
          chainId: 'eip155:84532',
          nonce: 'kitchen-sink-entitlement-0001',
          issuedAt: new Date().toISOString(),
        })
      ).toString('base64');
      const entitled = await invoke({ 'SIGN-IN-WITH-X': siwx });
      expect(entitled.status).toBe(200);
      expect(calls).toEqual({ verify: 1, settle: 1 });
    } finally {
      server.stop(true);
      facilitator.stop(true);
      await runtime.close();
    }
  });

  it('accepts one MPP credential and rejects invalid or replayed credentials', async () => {
    const runtime = await createKitchenSinkAgent({ profile: 'mpp' });
    const agentApp = await createAgentApp(runtime);
    registerEntrypoints(agentApp.addEntrypoint, runtime, { profile: 'mpp' });
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: agentApp.app.fetch.bind(agentApp.app),
    });
    if (server.port === undefined) throw new Error('Missing agent port');
    const url = `http://127.0.0.1:${server.port}/entrypoints/summarize/invoke`;
    const invoke = (authorization?: string) =>
      fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(authorization ? { Authorization: authorization } : {}),
        },
        body: JSON.stringify({ input: { text: 'mpp kitchen sink' } }),
      });

    try {
      const challengeResponse = await invoke();
      expect(challengeResponse.status).toBe(402);
      const challenge = Challenge.fromResponse(challengeResponse);
      const credential = Credential.serialize({
        challenge,
        payload: { proof: 'kitchen-sink' },
        source: 'did:example:kitchen-sink-payer',
      });

      const paid = await invoke(credential);
      expect(paid.status).toBe(200);
      expect(paid.headers.get('Payment-Receipt')).toBe(
        'kitchen-sink-mpp-receipt'
      );
      expect(await paid.json()).toMatchObject({
        output: { wordCount: 3 },
      });

      const replay = await invoke(credential);
      expect(replay.status).toBe(402);

      const invalidChallenge = Challenge.fromResponse(replay);
      const invalidCredential = Credential.serialize({
        challenge: invalidChallenge,
        payload: { proof: 'wrong' },
      });
      expect((await invoke(invalidCredential)).status).toBe(402);
    } finally {
      server.stop(true);
      await runtime.close();
    }
  });
});
