import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { privateKeyToAccount } from 'viem/accounts';

import { createPaidFetch, type PaidFetch } from './buyer-client';

const buyer = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
);

describe('documented paid service golden path', () => {
  const originalFetch = globalThis.fetch;
  let app: { fetch: (request: Request) => Response | Promise<Response> };

  beforeAll(async () => {
    process.env.PAYMENTS_FACILITATOR_URL = 'https://x402.org/facilitator';
    process.env.PAYMENTS_NETWORK = 'eip155:84532';
    process.env.PAYMENTS_RECEIVABLE_ADDRESS =
      '0x1234567890abcdef1234567890abcdef12345678';

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input);
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
        return Response.json({ isValid: true, payer: buyer.address });
      }
      if (path.endsWith('/settle')) {
        return Response.json({
          success: true,
          payer: buyer.address,
          transaction: '0xdocumented-settlement',
          network: 'eip155:84532',
        });
      }
      return Response.json(
        { error: 'unexpected facilitator request' },
        { status: 500 }
      );
    }) as typeof fetch;

    ({ app } = await import('./paid-service'));
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
    delete process.env.PAYMENTS_FACILITATOR_URL;
    delete process.env.PAYMENTS_NETWORK;
    delete process.env.PAYMENTS_RECEIVABLE_ADDRESS;
  });

  const invoke = (fetchImpl: PaidFetch) =>
    fetchImpl('http://localhost/entrypoints/analyze/invoke', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'docs-golden-path-operation-001',
      },
      body: JSON.stringify({
        input: { text: 'machine commerce works' },
      }),
    });

  it('challenges plain Fetch and fulfills one signed x402 retry', async () => {
    const localFetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        return app.fetch(request);
      },
      { preconnect: (_url: string | URL) => undefined }
    ) satisfies typeof fetch;

    const challenge = await invoke(localFetch);
    expect(challenge.status).toBe(402);
    expect(challenge.headers.get('PAYMENT-REQUIRED')).toBeTruthy();

    const paidFetch = createPaidFetch(
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      localFetch
    );
    const paid = await invoke(paidFetch);

    expect(paid.status).toBe(200);
    expect(paid.headers.get('PAYMENT-RESPONSE')).toBeTruthy();
    expect(await paid.json()).toMatchObject({
      status: 'succeeded',
      output: { words: 3, characters: 22 },
    });
  });
});
