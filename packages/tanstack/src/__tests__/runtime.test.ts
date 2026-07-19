import { describe, expect, it } from 'bun:test';
import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';
import { createTanStackRuntime } from '../runtime';

const meta = {
  name: 'test-agent',
  version: '0.0.1',
  description: 'test',
};

describe('createTanStackRuntime', () => {
  it('delegates route calls to the completed HTTP runtime', async () => {
    const agent = await createAgent(meta).use(http()).build();
    let invoked = false;
    agent.http.handlers.invoke = async () => {
      invoked = true;
      return Response.json({ delegated: true });
    };
    const { handlers } = await createTanStackRuntime(agent);

    const response = await handlers.invoke({
      request: new Request('https://agent.test/entrypoints/echo/invoke', {
        method: 'POST',
      }),
      params: { key: 'echo' },
    });

    expect(invoked).toBe(true);
    expect(await response.json()).toEqual({ delegated: true });
  });

  it('exposes tanstack handlers alongside the core runtime', async () => {
    const agent = await createAgent(meta)
      .use(http())
      .addEntrypoint({
        key: 'echo',
        handler: async ({ input }) => ({
          output: input ?? {},
        }),
      })
      .build();
    const { runtime: tanstackRuntime, handlers } =
      await createTanStackRuntime(agent);

    expect(typeof tanstackRuntime.entrypoints.add).toBe('function');
    expect(typeof handlers.invoke).toBe('function');
    expect(typeof handlers.oasf).toBe('function');

    const healthResponse = await handlers.health({
      request: new Request('https://agent.test/health'),
    });
    expect(healthResponse.status).toBe(200);
    expect(await healthResponse.json()).toEqual({
      ok: true,
      version: meta.version,
    });

    const invokeRequest = new Request(
      'https://agent.test/entrypoints/echo/invoke',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: { text: 'hello' } }),
      }
    );

    const invokeResponse = await handlers.invoke({
      request: invokeRequest,
      params: { key: 'echo' },
    });

    expect(invokeResponse.status).toBe(200);
    const payload = await invokeResponse.json();
    expect(payload.output).toEqual({ text: 'hello' });
    expect(payload.status).toBe('succeeded');
  });

  it('enforces SIWX inside the shared invoke handler', async () => {
    let authenticatedAddress: string | undefined;
    const agent = await createAgent({ name: 'tanstack-auth', version: '1.0.0' })
      .use(http())
      .use(
        payments({
          config: {
            payTo: '0xabc0000000000000000000000000000000000000',
            facilitatorUrl: 'https://facilitator.example',
            network: 'eip155:84532',
            storage: { type: 'in-memory' },
            siwx: {
              enabled: true,
              storage: { type: 'in-memory' },
              verify: { skipSignatureVerification: true },
            },
          },
        })
      )
      .addEntrypoint({
        key: 'private',
        siwx: { authOnly: true },
        handler: async context => {
          authenticatedAddress = context.auth?.address;
          return { output: { ok: true } };
        },
      })
      .build();
    const { handlers } = await createTanStackRuntime(agent);
    const url = 'https://agent.test/api/agent/entrypoints/private/invoke';
    const body = JSON.stringify({ input: {} });

    const unauthorized = await handlers.invoke({
      request: new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      }),
      params: { key: 'private' },
    });
    expect(unauthorized.status).toBe(401);

    const address = '0x1234567890abcdef1234567890abcdef12345678';
    const credential = Buffer.from(
      JSON.stringify({
        domain: 'agent.test',
        address,
        uri: url,
        version: '1',
        chainId: 'eip155:84532',
        nonce: `tanstack-${Date.now()}`,
        issuedAt: new Date().toISOString(),
      })
    ).toString('base64');
    const authorized = await handlers.invoke({
      request: new Request(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'SIGN-IN-WITH-X': credential,
        },
        body,
      }),
      params: { key: 'private' },
    });

    expect(authorized.status).toBe(200);
    expect(authenticatedAddress).toBe(address);
  });

  it('publishes the mounted API base path in the Agent Card', async () => {
    const agent = await createAgent({ name: 'based', version: '1.0.0' })
      .use(http({ basePath: '/api/agent' }))
      .build();
    const { handlers, routes } = await createTanStackRuntime(agent);

    const response = await handlers.manifest({
      request: new Request('https://agent.test/.well-known/agent-card.json'),
    });
    const card = (await response.json()) as { url: string };

    expect(card.url).toBe('https://agent.test/api/agent/');
    expect(routes.map(route => route.path)).toContain('/api/agent/health');
    expect(routes.map(route => route.path)).not.toContain('/api/agent/tasks');
  });
});
