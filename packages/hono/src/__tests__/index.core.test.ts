import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { payments } from '@lucid-agents/payments';
import { createAgentApp, withPayments } from '@lucid-agents/hono';
import { resolvePrice } from '@lucid-agents/payments';
import type { EntrypointDef } from '@lucid-agents/types/core';
import type { PaymentsConfig } from '@lucid-agents/types/payments';
import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

const meta = { name: 'tester', version: '0.0.1', description: 'test agent' };

describe('resolvePrice', () => {
  const payments: PaymentsConfig = {
    payTo: '0xabc0000000000000000000000000000000000000',
    facilitatorUrl: 'https://facilitator.example' as any,
    network: 'base-sepolia' as any,
  };

  it('prefers flat string price on entrypoint', () => {
    const entrypoint: EntrypointDef = { key: 'x', price: '10' };
    expect(resolvePrice(entrypoint, payments, 'invoke')).toBe('10');
  });

  it('returns both invoke and stream prices from price object', () => {
    const entrypoint: EntrypointDef = {
      key: 'x',
      price: { invoke: '7', stream: '12' },
    };
    expect(resolvePrice(entrypoint, payments, 'invoke')).toBe('7');
    expect(resolvePrice(entrypoint, payments, 'stream')).toBe('12');
  });

  it('returns null for missing method in price object', () => {
    const entrypoint: EntrypointDef = {
      key: 'x',
      price: { invoke: '7' }, // No stream price
    };
    expect(resolvePrice(entrypoint, payments, 'stream')).toBe(null);
  });

  it('returns null when entrypoint has no price', () => {
    const entrypoint: EntrypointDef = { key: 'x' };
    expect(resolvePrice(entrypoint, payments, 'invoke')).toBe(null);
    expect(resolvePrice(entrypoint, undefined, 'invoke')).toBe(null);
  });
});

describe('withPayments helper', () => {
  const payments: PaymentsConfig = {
    payTo: '0xabc0000000000000000000000000000000000000',
    facilitatorUrl: 'https://facilitator.example' as any,
    network: 'base-sepolia' as any,
  };

  const entrypoint: EntrypointDef = {
    key: 'test',
    price: { invoke: '42' },
  };

  it('registers middleware when price/network resolved', () => {
    const calls: Array<[string, any]> = [];
    const app = { use: (...args: any[]) => calls.push([...args] as any) };
    const middlewareFactory = (
      payTo: string,
      mapping: Record<string, { price: string; network: string }>,
      facilitatorConfig: { url: string }
    ) => {
      return { payTo, mapping, facilitator: facilitatorConfig };
    };
    const didRegister = withPayments({
      app: app as any,
      path: '/entrypoints/test/invoke',
      entrypoint,
      kind: 'invoke',
      payments,
      middlewareFactory: middlewareFactory as any,
    });
    expect(didRegister).toBe(true);
    expect(calls.length).toBe(1);
    const [path, middleware] = calls[0];
    expect(path).toBe('/entrypoints/test/invoke');
    const routeKeys = Object.keys(middleware.mapping);
    expect(routeKeys).toContain('POST /entrypoints/test/invoke');
    expect(routeKeys).toContain('GET /entrypoints/test/invoke');

    const postConfig = middleware.mapping['POST /entrypoints/test/invoke'];
    expect(postConfig.price).toBe('42');
    expect(postConfig.config?.mimeType).toBe('application/json');

    const getConfig = middleware.mapping['GET /entrypoints/test/invoke'];
    expect(getConfig.price).toBe('42');
    expect(getConfig.config?.mimeType).toBe('application/json');
    expect(middleware.facilitator).toEqual({
      url: payments.facilitatorUrl,
    });
  });

  it('skips registration when no payments provided', () => {
    const calls: any[] = [];
    const app = { use: (...args: any[]) => calls.push([...args]) };
    const didRegister = withPayments({
      app: app as any,
      path: '/entrypoints/test/invoke',
      entrypoint,
      kind: 'invoke',
    });
    expect(didRegister).toBe(false);
    expect(calls.length).toBe(0);
  });

  it('skips registration when entrypoint has no price', () => {
    const calls: any[] = [];
    const app = { use: (...args: any[]) => calls.push([...args]) };
    const didRegister = withPayments({
      app: app as any,
      path: '/entrypoints/test/invoke',
      entrypoint: { key: 'test' }, // No price defined
      kind: 'invoke',
      payments,
    });
    expect(didRegister).toBe(false);
    expect(calls.length).toBe(0);
  });

  it('allows overriding facilitator config', () => {
    const calls: Array<[string, any]> = [];
    const app = { use: (...args: any[]) => calls.push([...args] as any) };
    const customFacilitator = { url: 'https://override.example' as any };
    const middlewareFactory = (
      payTo: string,
      mapping: Record<string, { price: string; network: string }>,
      facilitatorConfig: { url: string }
    ) => ({ payTo, mapping, facilitator: facilitatorConfig });
    const didRegister = withPayments({
      app: app as any,
      path: '/entrypoints/test/invoke',
      entrypoint,
      kind: 'invoke',
      payments,
      facilitator: customFacilitator,
      middlewareFactory: middlewareFactory as any,
    });
    expect(didRegister).toBe(true);
    const [, middleware] = calls[0];
    expect(middleware.facilitator).toBe(customFacilitator);
  });
});

describe('manifest building', () => {
  it('caches manifest per origin', async () => {
    const agent = await createAgent(meta)
      .use(http())
      .addEntrypoint({
        key: 'initial',
        description: 'initial entrypoint',
      })
      .build();
    const { app } = await createAgentApp(agent);

    // First request - builds manifest
    const res1 = await app.request('http://agent/.well-known/agent.json');
    const manifest1 = await res1.json();
    expect(manifest1.entrypoints.initial).toBeTruthy();

    // Second request to same origin - should return cached manifest
    const res2 = await app.request('http://agent/.well-known/agent.json');
    const manifest2 = await res2.json();
    expect(manifest2).toEqual(manifest1);

    // Different origin - should build new manifest
    const res3 = await app.request(
      'https://different.example/.well-known/agent.json'
    );
    const manifest3 = await res3.json();
    expect(manifest3.entrypoints.initial).toBeTruthy();
    expect(manifest3.url).toBe('https://different.example/');
  });

  it('invalidates manifest cache when entrypoint added before first request', async () => {
    const agent = await createAgent(meta)
      .use(http())
      .addEntrypoint({
        key: 'initial',
        description: 'initial entrypoint',
      })
      .build();
    const { app, addEntrypoint } = await createAgentApp(agent);

    // Add entrypoint before any requests (Hono limitation)
    addEntrypoint({
      key: 'added',
      description: 'newly added entrypoint',
    });

    // Request should include both entrypoints
    const res = await app.request('http://agent/.well-known/agent.json');
    const manifest = await res.json();
    expect(manifest.entrypoints.initial).toBeTruthy();
    expect(manifest.entrypoints.added).toBeTruthy();
    expect(manifest.entrypoints.added.description).toBe(
      'newly added entrypoint'
    );
  });
});

describe('createAgentApp invoke/stream routes', () => {
  it('auto-registers entrypoints passed via options', async () => {
    const agent = await createAgent(meta)
      .use(http())
      .addEntrypoint({
        key: 'startup',
        handler: async ({ input }: { input: any }) => ({
          output: { echoed: input.value ?? null },
        }),
      })
      .build();
    const { app, addEntrypoint } = await createAgentApp(agent);
    expect(typeof addEntrypoint).toBe('function');
    const res = await app.request('http://agent/entrypoints/startup/invoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: { value: 'hello' } }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.output).toEqual({ echoed: 'hello' });
  });

  it('validates input schema and returns 400 on mismatch', async () => {
    const agent = await createAgent(meta).use(http()).build();
    const { app, addEntrypoint } = await createAgentApp(agent);
    addEntrypoint({
      key: 'echo',
      input: z.object({ text: z.string() }),
      handler: async () => ({ output: { text: 'ok' } }),
    });

    const res = await app.request('http://agent/entrypoints/echo/invoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: { text: 123 } }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_input');
  });

  it('returns 501 when handler missing', async () => {
    const agent = await createAgent(meta).use(http()).build();
    const { app, addEntrypoint } = await createAgentApp(agent);
    addEntrypoint({ key: 'noop' });
    const res = await app.request('http://agent/entrypoints/noop/invoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: {} }),
    });
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error.code).toBe('not_implemented');
  });

  it('returns handler result and run metadata', async () => {
    const agent = await createAgent(meta).use(http()).build();
    const { app, addEntrypoint } = await createAgentApp(agent);
    addEntrypoint({
      key: 'echo',
      handler: async ({ input }) => ({
        output: input,
        usage: { total_tokens: 1 },
        model: 'unit-test',
      }),
    });
    const res = await app.request('http://agent/entrypoints/echo/invoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: { foo: 'bar' } }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('succeeded');
    expect(body.output).toEqual({ foo: 'bar' });
    expect(body.model).toBe('unit-test');
  });

  it('surfaces entrypoint price in manifest', async () => {
    const agent = await createAgent(meta)
      .use(http())
      .use(
        payments({
          config: {
            payTo: '0xabc0000000000000000000000000000000000000',
            facilitatorUrl: 'https://facilitator.example' as any,
            network: 'base-sepolia' as any,
          },
        })
      )
      .build();
    const { app, addEntrypoint } = await createAgentApp(agent);

    addEntrypoint({
      key: 'priced',
      price: '123',
      handler: async () => ({ output: { ok: true } }),
    });

    const res = await app.request('http://agent/.well-known/agent.json');
    expect(res.status).toBe(200);
    const manifest = await res.json();
    expect(manifest.entrypoints?.priced?.pricing?.invoke).toBe('123');
  });

  it('surfaces price in manifest when payments are configured', async () => {
    const agent = await createAgent(meta)
      .use(http())
      .use(
        payments({
          config: {
            payTo: '0xabc0000000000000000000000000000000000000',
            facilitatorUrl: 'https://facilitator.example' as any,
            network: 'base-sepolia' as any,
          },
        })
      )
      .build();
    const { app, addEntrypoint } = await createAgentApp(agent);

    addEntrypoint({
      key: 'priced-explicit',
      price: '222',
      handler: async () => ({ output: { ok: true } }),
    });

    const res = await app.request('http://agent/.well-known/agent.json');
    expect(res.status).toBe(200);
    const manifest = await res.json();
    expect(manifest.entrypoints?.['priced-explicit']?.pricing?.invoke).toBe(
      '222'
    );
  });

  it('requires payment when entrypoint price is set', async () => {
    const agent = await createAgent(meta)
      .use(http())
      .use(
        payments({
          config: {
            payTo: '0xabc0000000000000000000000000000000000000',
            facilitatorUrl: 'https://facilitator.example' as any,
            network: 'base-sepolia' as any,
          },
        })
      )
      .build();
    const { app, addEntrypoint } = await createAgentApp(agent);

    addEntrypoint({
      key: 'paywalled',
      price: '321',
      handler: async () => ({ output: { paywalled: true } }),
    });

    const res = await app.request('http://agent/entrypoints/paywalled/invoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: {} }),
    });

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(body.accepts?.[0]?.maxAmountRequired).toBeDefined();
  });

  it('auto-paywalls priced entrypoints when payments configured', async () => {
    const agent = await createAgent(meta)
      .use(http())
      .use(
        payments({
          config: {
            payTo: '0xabc0000000000000000000000000000000000000',
            facilitatorUrl: 'https://facilitator.example' as any,
            network: 'base-sepolia' as any,
          },
        })
      )
      .build();
    const { app, addEntrypoint } = await createAgentApp(agent);

    addEntrypoint({
      key: 'auto-paywalled',
      price: '444',
      handler: async () => ({ output: { ok: true } }),
    });

    const res = await app.request(
      'http://agent/entrypoints/auto-paywalled/invoke',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: {} }),
      }
    );

    expect(res.status).toBe(402);
  });

  it('emits SSE envelopes for stream entrypoint', async () => {
    const agent = await createAgent(meta).use(http()).build();
    const { app, addEntrypoint } = await createAgentApp(agent);
    addEntrypoint({
      key: 'stream',
      stream: async (_ctx, emit) => {
        await emit({ kind: 'delta', delta: 'a' });
        await emit({ kind: 'text', text: 'done' });
        return { output: { done: true } };
      },
    });
    const res = await app.request('http://agent/entrypoints/stream/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: {} }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('event: run-start');
    expect(text).toContain('event: delta');
    expect(text).toContain('event: run-end');
    expect(text).toContain('"status":"succeeded"');
  });

  it('returns 400 when stream not supported', async () => {
    const agent = await createAgent(meta).use(http()).build();
    const { app, addEntrypoint } = await createAgentApp(agent);
    addEntrypoint({
      key: 'no-stream',
      handler: async () => ({ output: {} }),
    });
    const res = await app.request('http://agent/entrypoints/no-stream/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: {} }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('stream_not_supported');
  });
});

describe('Zod schema features (defaults, coercions, transformations)', () => {
  it('applies default values from Zod schema in invoke handler', async () => {
    const agent = await createAgent(meta).use(http()).build();
    const { app, addEntrypoint } = await createAgentApp(agent);
    addEntrypoint({
      key: 'with-defaults',
      input: z.object({
        name: z.string(),
        count: z.number().default(10),
        enabled: z.boolean().default(true),
      }),
      handler: async ({ input }) => ({
        output: { received: input },
      }),
    });

    const res = await app.request(
      'http://agent/entrypoints/with-defaults/invoke',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: { name: 'test' } }),
      }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.output.received).toEqual({
      name: 'test',
      count: 10,
      enabled: true,
    });
  });

  it('applies coercions from Zod schema in invoke handler', async () => {
    const agent = await createAgent(meta).use(http()).build();
    const { app, addEntrypoint } = await createAgentApp(agent);
    addEntrypoint({
      key: 'with-coercion',
      input: z.object({
        age: z.coerce.number(),
        active: z.coerce.boolean(),
      }),
      handler: async ({ input }: { input: any }) => ({
        output: {
          types: { age: typeof input.age, active: typeof input.active },
          values: input,
        },
      }),
    });

    const res = await app.request(
      'http://agent/entrypoints/with-coercion/invoke',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: { age: '42', active: 'true' } }),
      }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.output.types).toEqual({ age: 'number', active: 'boolean' });
    expect(body.output.values).toEqual({ age: 42, active: true });
  });

  it('applies transformations from Zod schema in invoke handler', async () => {
    const agent = await createAgent(meta).use(http()).build();
    const { app, addEntrypoint } = await createAgentApp(agent);
    addEntrypoint({
      key: 'with-transform',
      input: z.object({
        email: z.string().transform(val => val.toLowerCase().trim()),
        tags: z.string().transform(val => val.split(',').map(t => t.trim())),
      }),
      handler: async ({ input }) => ({
        output: { transformed: input },
      }),
    });

    const res = await app.request(
      'http://agent/entrypoints/with-transform/invoke',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          input: { email: '  TEST@EXAMPLE.COM  ', tags: 'foo, bar, baz' },
        }),
      }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.output.transformed).toEqual({
      email: 'test@example.com',
      tags: ['foo', 'bar', 'baz'],
    });
  });

  it('applies default values from Zod schema in stream handler', async () => {
    const agent = await createAgent(meta).use(http()).build();
    const { app, addEntrypoint } = await createAgentApp(agent);
    addEntrypoint({
      key: 'stream-defaults',
      input: z.object({
        message: z.string(),
        iterations: z.number().default(3),
      }),
      stream: async ({ input }: { input: any }, emit) => {
        await emit({ kind: 'text', text: `iterations=${input.iterations}` });
        return { output: { iterations: input.iterations } };
      },
    });

    const res = await app.request(
      'http://agent/entrypoints/stream-defaults/stream',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: { message: 'hello' } }),
      }
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('iterations=3');
  });

  it('applies transformations from Zod schema in stream handler', async () => {
    const agent = await createAgent(meta).use(http()).build();
    const { app, addEntrypoint } = await createAgentApp(agent);
    addEntrypoint({
      key: 'stream-transform',
      input: z.object({
        text: z.string().transform(val => val.toUpperCase()),
      }),
      stream: async ({ input }: { input: any }, emit) => {
        await emit({ kind: 'text', text: input.text });
        return { output: { text: input.text } };
      },
    });

    const res = await app.request(
      'http://agent/entrypoints/stream-transform/stream',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: { text: 'hello world' } }),
      }
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('HELLO WORLD');
  });
});

describe('Landing page renderer abstraction', () => {
  it('disabling landing page removes / route entirely', async () => {
    const agent = await createAgent(meta)
      .use(http({ landingPage: false }))
      .addEntrypoint({ key: 'test' })
      .build();
    const { app } = await createAgentApp(agent);

    const res = await app.request('http://agent/');
    expect(res.status).toBe(404);
  });

  it('enables landing page when landingPage option is true', async () => {
    const agent = await createAgent(meta)
      .use(http({ landingPage: true }))
      .addEntrypoint({ key: 'test' })
      .build();
    const { app } = await createAgentApp(agent);

    const res = await app.request('http://agent/');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(meta.name);
  });

  it('default renderer handles minimal entrypoint configuration', async () => {
    const agent = await createAgent(meta)
      .use(http())
      .addEntrypoint({ key: 'minimal' })
      .build();
    const { app } = await createAgentApp(agent);

    const res = await app.request('http://agent/');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('minimal');
  });
});
