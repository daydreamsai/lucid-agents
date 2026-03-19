import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';
import { createAgentApp } from '@lucid-agents/hono';
import type { AgentAuthContext } from '@lucid-agents/types/siwx';
import type { SIWxStorage } from '@lucid-agents/payments';
import { describe, expect, it, beforeAll, afterAll } from 'bun:test';

const meta = { name: 'siwx-tester', version: '0.0.1', description: 'SIWX test agent' };

const mockFacilitatorResponse = {
  kinds: [
    {
      scheme: 'exact',
      network: 'eip155:84532',
      asset: {
        address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        decimals: 6,
        eip712: {
          name: 'USDC',
          version: '2',
        },
      },
    },
  ],
};

let originalFetch: typeof globalThis.fetch;

beforeAll(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (url.includes('facilitator') && url.includes('/supported')) {
      return new Response(JSON.stringify(mockFacilitatorResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.includes('facilitator') && url.includes('/verify')) {
      return new Response(
        JSON.stringify({ valid: false, reason: 'No payment' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    return originalFetch(input, init);
  };
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

function createSIWxHeader(overrides?: Record<string, unknown>): string {
  const payload = {
    domain: 'localhost',
    address: '0x1234567890abcdef1234567890abcdef12345678',
    uri: 'http://localhost/entrypoints/report/invoke',
    version: '1',
    chainId: 'eip155:84532',
    nonce: `test-nonce-${Date.now()}-${Math.random()}`,
    issuedAt: new Date().toISOString(),
    ...overrides,
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

describe('SIWX Integration (Hono)', () => {
  describe('paid route with SIWX reuse', () => {
    // These tests require a fully working x402 facilitator mock.
    // The x402 middleware performs route validation against the facilitator's /supported endpoint
    // during initialization, which requires a production-compatible mock.
    // Skipped for the same reason as payment tests in index.core.test.ts.
    it.skip('should return 402 with SIWX extension for unpaid request', async () => {
      const agent = await createAgent(meta)
        .use(http())
        .use(
          payments({
            config: {
              payTo: '0xabc0000000000000000000000000000000000000',
              facilitatorUrl: 'https://facilitator.test',
              network: 'eip155:84532',
              siwx: {
                enabled: true,
                defaultStatement: 'Sign to access',
                expirationSeconds: 3600,
                storage: { type: 'in-memory' },
              },
            },
          })
        )
        .addEntrypoint({
          key: 'report',
          price: '100',
          siwx: { enabled: true },
          handler: async () => ({ output: { data: 'secret' } }),
        })
        .build();
      const { app } = await createAgentApp(agent);

      const res = await app.request(
        'http://localhost/entrypoints/report/invoke',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ input: {} }),
        }
      );

      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.siwx).toBeDefined();
      expect(body.siwx.scheme).toBe('sign-in-with-x');
      expect(body.siwx.domain).toBe('localhost');
    });

    it.skip('should grant access via SIWX for entitled wallet (bypassing payment)', async () => {
      const agent = await createAgent(meta)
        .use(http())
        .use(
          payments({
            config: {
              payTo: '0xabc0000000000000000000000000000000000000',
              facilitatorUrl: 'https://facilitator.test',
              network: 'eip155:84532',
              siwx: {
                enabled: true,
                storage: { type: 'in-memory' },
              },
            },
          })
        )
        .addEntrypoint({
          key: 'report',
          price: '100',
          siwx: { enabled: true },
          handler: async () => ({ output: { data: 'secret' } }),
        })
        .build();
      const { app } = await createAgentApp(agent);

      const siwxStorage = agent.payments!.siwxStorage as SIWxStorage;
      await siwxStorage.recordPayment(
        'http://localhost/entrypoints/report/invoke',
        '0x1234567890abcdef1234567890abcdef12345678',
        'eip155:84532'
      );

      const siwxHeader = createSIWxHeader();

      const res = await app.request(
        'http://localhost/entrypoints/report/invoke',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'SIGN-IN-WITH-X': siwxHeader,
          },
          body: JSON.stringify({ input: {} }),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.output).toEqual({ data: 'secret' });
    });

    it.skip('should reject invalid SIWX header and fall through to payment', async () => {
      const agent = await createAgent(meta)
        .use(http())
        .use(
          payments({
            config: {
              payTo: '0xabc0000000000000000000000000000000000000',
              facilitatorUrl: 'https://facilitator.test',
              network: 'eip155:84532',
              siwx: {
                enabled: true,
                storage: { type: 'in-memory' },
              },
            },
          })
        )
        .addEntrypoint({
          key: 'report',
          price: '100',
          siwx: { enabled: true },
          handler: async () => ({ output: { data: 'secret' } }),
        })
        .build();
      const { app } = await createAgentApp(agent);

      const res = await app.request(
        'http://localhost/entrypoints/report/invoke',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'SIGN-IN-WITH-X': 'not-valid-base64!!!',
          },
          body: JSON.stringify({ input: {} }),
        }
      );

      expect(res.status).toBe(402);
    });

    it.skip('should reject replayed nonce', async () => {
      const agent = await createAgent(meta)
        .use(http())
        .use(
          payments({
            config: {
              payTo: '0xabc0000000000000000000000000000000000000',
              facilitatorUrl: 'https://facilitator.test',
              network: 'eip155:84532',
              siwx: {
                enabled: true,
                storage: { type: 'in-memory' },
              },
            },
          })
        )
        .addEntrypoint({
          key: 'report',
          price: '100',
          siwx: { enabled: true },
          handler: async () => ({ output: { data: 'secret' } }),
        })
        .build();
      const { app } = await createAgentApp(agent);

      const siwxStorage = agent.payments!.siwxStorage as SIWxStorage;
      await siwxStorage.recordPayment(
        'http://localhost/entrypoints/report/invoke',
        '0x1234567890abcdef1234567890abcdef12345678',
        'eip155:84532'
      );

      const fixedNonce = 'replay-test-nonce';
      const siwxHeader = createSIWxHeader({ nonce: fixedNonce });

      const res1 = await app.request(
        'http://localhost/entrypoints/report/invoke',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'SIGN-IN-WITH-X': siwxHeader,
          },
          body: JSON.stringify({ input: {} }),
        }
      );
      expect(res1.status).toBe(200);

      const res2 = await app.request(
        'http://localhost/entrypoints/report/invoke',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'SIGN-IN-WITH-X': siwxHeader,
          },
          body: JSON.stringify({ input: {} }),
        }
      );
      expect(res2.status).toBe(402);
    });

    it.skip('should record entitlement after successful payment', async () => {
      // Requires full x402 payment flow mock
    });
  });

  describe('auth-only route', () => {
    it('should return 401 when no SIWX header on auth-only route', async () => {
      const agent = await createAgent(meta)
        .use(http())
        .use(
          payments({
            config: {
              payTo: '0xabc0000000000000000000000000000000000000',
              facilitatorUrl: 'https://facilitator.test',
              network: 'eip155:84532',
              siwx: {
                enabled: true,
                defaultStatement: 'Authenticate your wallet',
                expirationSeconds: 3600,
                storage: { type: 'in-memory' },
              },
            },
          })
        )
        .addEntrypoint({
          key: 'profile',
          siwx: { authOnly: true },
          handler: async ({ auth }: { auth?: AgentAuthContext }) => ({
            output: { address: auth?.address ?? 'unknown' },
          }),
        })
        .build();
      const { app } = await createAgentApp(agent);

      const res = await app.request(
        'http://localhost/entrypoints/profile/invoke',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ input: {} }),
        }
      );

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('auth_required');
      expect(body.error.siwx).toBeDefined();
      expect(body.error.siwx.scheme).toBe('sign-in-with-x');
    });

    it('should grant access with valid SIWX on auth-only route', async () => {
      const agent = await createAgent(meta)
        .use(http())
        .use(
          payments({
            config: {
              payTo: '0xabc0000000000000000000000000000000000000',
              facilitatorUrl: 'https://facilitator.test',
              network: 'eip155:84532',
              siwx: {
                enabled: true,
                storage: { type: 'in-memory' },
              },
            },
          })
        )
        .addEntrypoint({
          key: 'profile',
          siwx: { authOnly: true },
          handler: async (ctx: { auth?: AgentAuthContext }) => ({
            output: { address: ctx.auth?.address ?? 'no-auth' },
          }),
        })
        .build();
      const { app } = await createAgentApp(agent);

      const siwxHeader = createSIWxHeader({
        uri: 'http://localhost/entrypoints/profile/invoke',
      });

      const res = await app.request(
        'http://localhost/entrypoints/profile/invoke',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'SIGN-IN-WITH-X': siwxHeader,
          },
          body: JSON.stringify({ input: {} }),
        }
      );

      expect(res.status).toBe(200);
    });

    it('should reject invalid SIWX on auth-only route', async () => {
      const agent = await createAgent(meta)
        .use(http())
        .use(
          payments({
            config: {
              payTo: '0xabc0000000000000000000000000000000000000',
              facilitatorUrl: 'https://facilitator.test',
              network: 'eip155:84532',
              siwx: {
                enabled: true,
                storage: { type: 'in-memory' },
              },
            },
          })
        )
        .addEntrypoint({
          key: 'profile',
          siwx: { authOnly: true },
          handler: async () => ({ output: {} }),
        })
        .build();
      const { app } = await createAgentApp(agent);

      const res = await app.request(
        'http://localhost/entrypoints/profile/invoke',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'SIGN-IN-WITH-X': 'garbage-not-base64!!!',
          },
          body: JSON.stringify({ input: {} }),
        }
      );

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('auth_failed');
    });

    it('should reject SIWX with domain mismatch on auth-only route', async () => {
      const agent = await createAgent(meta)
        .use(http())
        .use(
          payments({
            config: {
              payTo: '0xabc0000000000000000000000000000000000000',
              facilitatorUrl: 'https://facilitator.test',
              network: 'eip155:84532',
              siwx: {
                enabled: true,
                storage: { type: 'in-memory' },
              },
            },
          })
        )
        .addEntrypoint({
          key: 'profile',
          siwx: { authOnly: true },
          handler: async () => ({ output: {} }),
        })
        .build();
      const { app } = await createAgentApp(agent);

      const siwxHeader = createSIWxHeader({
        uri: 'http://localhost/entrypoints/profile/invoke',
        domain: 'evil.com', // Wrong domain
      });

      const res = await app.request(
        'http://localhost/entrypoints/profile/invoke',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'SIGN-IN-WITH-X': siwxHeader,
          },
          body: JSON.stringify({ input: {} }),
        }
      );

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe('auth_failed');
    });

    it('should reject replayed nonce on auth-only route', async () => {
      const agent = await createAgent(meta)
        .use(http())
        .use(
          payments({
            config: {
              payTo: '0xabc0000000000000000000000000000000000000',
              facilitatorUrl: 'https://facilitator.test',
              network: 'eip155:84532',
              siwx: {
                enabled: true,
                storage: { type: 'in-memory' },
              },
            },
          })
        )
        .addEntrypoint({
          key: 'profile',
          siwx: { authOnly: true },
          handler: async () => ({ output: { ok: true } }),
        })
        .build();
      const { app } = await createAgentApp(agent);

      const fixedNonce = 'auth-only-replay-nonce';
      const siwxHeader = createSIWxHeader({
        uri: 'http://localhost/entrypoints/profile/invoke',
        nonce: fixedNonce,
      });

      // First request succeeds
      const res1 = await app.request(
        'http://localhost/entrypoints/profile/invoke',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'SIGN-IN-WITH-X': siwxHeader,
          },
          body: JSON.stringify({ input: {} }),
        }
      );
      expect(res1.status).toBe(200);

      // Second request with same nonce fails
      const res2 = await app.request(
        'http://localhost/entrypoints/profile/invoke',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'SIGN-IN-WITH-X': siwxHeader,
          },
          body: JSON.stringify({ input: {} }),
        }
      );
      expect(res2.status).toBe(401);
      const body = await res2.json();
      expect(body.error.code).toBe('auth_failed');
    });
  });

  describe('non-SIWX route', () => {
    it.skip('should behave normally (no SIWX extension in 402)', async () => {
      // Requires full x402 facilitator mock
      const agent = await createAgent(meta)
        .use(http())
        .use(
          payments({
            config: {
              payTo: '0xabc0000000000000000000000000000000000000',
              facilitatorUrl: 'https://facilitator.test',
              network: 'eip155:84532',
            },
          })
        )
        .addEntrypoint({
          key: 'basic',
          price: '50',
          handler: async () => ({ output: { ok: true } }),
        })
        .build();
      const { app } = await createAgentApp(agent);

      const res = await app.request(
        'http://localhost/entrypoints/basic/invoke',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ input: {} }),
        }
      );

      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.siwx).toBeUndefined();
    });
  });

  describe('handler auth context', () => {
    it.skip('should provide ctx.auth on SIWX-authenticated paid request', async () => {
      // Requires full x402 facilitator mock for paid route setup
      let capturedAuth: AgentAuthContext | undefined;

      const agent = await createAgent(meta)
        .use(http())
        .use(
          payments({
            config: {
              payTo: '0xabc0000000000000000000000000000000000000',
              facilitatorUrl: 'https://facilitator.test',
              network: 'eip155:84532',
              siwx: {
                enabled: true,
                storage: { type: 'in-memory' },
              },
            },
          })
        )
        .addEntrypoint({
          key: 'report',
          price: '100',
          siwx: { enabled: true },
          handler: async (ctx: { auth?: AgentAuthContext }) => {
            capturedAuth = ctx.auth;
            return { output: { ok: true } };
          },
        })
        .build();
      const { app } = await createAgentApp(agent);

      const siwxStorage = agent.payments!.siwxStorage as SIWxStorage;
      await siwxStorage.recordPayment(
        'http://localhost/entrypoints/report/invoke',
        '0x1234567890abcdef1234567890abcdef12345678',
        'eip155:84532'
      );

      const siwxHeader = createSIWxHeader();

      await app.request('http://localhost/entrypoints/report/invoke', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'SIGN-IN-WITH-X': siwxHeader,
        },
        body: JSON.stringify({ input: {} }),
      });

      expect(capturedAuth).toBeDefined();
      expect(capturedAuth!.scheme).toBe('siwx');
      expect(capturedAuth!.address).toBe(
        '0x1234567890abcdef1234567890abcdef12345678'
      );
      expect(capturedAuth!.grantedBy).toBe('entitlement');
    });

    it('should provide ctx.auth on auth-only SIWX request', async () => {
      let capturedAuth: AgentAuthContext | undefined;

      const agent = await createAgent(meta)
        .use(http())
        .use(
          payments({
            config: {
              payTo: '0xabc0000000000000000000000000000000000000',
              facilitatorUrl: 'https://facilitator.test',
              network: 'eip155:84532',
              siwx: {
                enabled: true,
                storage: { type: 'in-memory' },
              },
            },
          })
        )
        .addEntrypoint({
          key: 'profile',
          siwx: { authOnly: true },
          handler: async (ctx: { auth?: AgentAuthContext }) => {
            capturedAuth = ctx.auth;
            return { output: { ok: true } };
          },
        })
        .build();
      const { app } = await createAgentApp(agent);

      const siwxHeader = createSIWxHeader({
        uri: 'http://localhost/entrypoints/profile/invoke',
      });

      const res = await app.request(
        'http://localhost/entrypoints/profile/invoke',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'SIGN-IN-WITH-X': siwxHeader,
          },
          body: JSON.stringify({ input: {} }),
        }
      );

      expect(res.status).toBe(200);
      expect(capturedAuth).toBeDefined();
      expect(capturedAuth!.scheme).toBe('siwx');
      expect(capturedAuth!.address).toBe(
        '0x1234567890abcdef1234567890abcdef12345678'
      );
      expect(capturedAuth!.grantedBy).toBe('auth-only');
    });

    it('should not provide ctx.auth on non-SIWX request', async () => {
      let capturedAuth: AgentAuthContext | undefined = undefined;

      const agent = await createAgent(meta)
        .use(http())
        .addEntrypoint({
          key: 'open',
          handler: async (ctx: { auth?: AgentAuthContext }) => {
            capturedAuth = ctx.auth;
            return { output: { ok: true } };
          },
        })
        .build();
      const { app } = await createAgentApp(agent);

      await app.request('http://localhost/entrypoints/open/invoke', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: {} }),
      });

      expect(capturedAuth).toBeUndefined();
    });
  });
});
