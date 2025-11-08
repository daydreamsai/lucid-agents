import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

import {
  buildManifest,
  createAgentApp,
  resolveEntrypointPrice,
  withPayments,
} from '../index';
import type { EntrypointDef, PaymentsConfig } from '../types';

const meta = { name: 'tester', version: '0.0.1', description: 'test agent' };

describe('resolveEntrypointPrice', () => {
  const payments: PaymentsConfig = {
    payTo: '0xabc0000000000000000000000000000000000000',
    facilitatorUrl: 'https://facilitator.example' as any,
    network: 'base-sepolia' as any,
    defaultPrice: '99',
  };

  it('prefers flat string price on entrypoint', () => {
    const entrypoint: EntrypointDef = { key: 'x', price: '10' };
    expect(resolveEntrypointPrice(entrypoint, payments, 'invoke')).toBe('10');
  });

  it('prefers per-method price object before default', () => {
    const entrypoint: EntrypointDef = {
      key: 'x',
      price: { invoke: '7' },
    };
    expect(resolveEntrypointPrice(entrypoint, payments, 'invoke')).toBe('7');
    expect(resolveEntrypointPrice(entrypoint, payments, 'stream')).toBe('99');
  });

  it('falls back to global default price', () => {
    const entrypoint: EntrypointDef = { key: 'x' };
    expect(resolveEntrypointPrice(entrypoint, payments, 'invoke')).toBe('99');
  });

  it('returns undefined when no price available', () => {
    const entrypoint: EntrypointDef = { key: 'x' };
    expect(resolveEntrypointPrice(entrypoint, undefined, 'invoke')).toBe(
      undefined
    );
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
      app,
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
      app,
      path: '/entrypoints/test/invoke',
      entrypoint,
      kind: 'invoke',
    });
    expect(didRegister).toBe(false);
    expect(calls.length).toBe(0);
  });

  it('skips registration when price cannot be resolved', () => {
    const calls: any[] = [];
    const app = { use: (...args: any[]) => calls.push([...args]) };
    const didRegister = withPayments({
      app,
      path: '/entrypoints/test/invoke',
      entrypoint: { key: 'test' },
      kind: 'invoke',
      payments: { ...payments, defaultPrice: undefined },
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
      app,
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

describe('buildManifest', () => {
  const registry: EntrypointDef[] = [
    {
      key: 'echo',
      description: 'echoes',
      input: z.object({ text: z.string() }),
      output: z.object({ text: z.string() }),
      stream: async () => ({ status: 'succeeded' }),
    },
    {
      key: 'ping',
    },
  ];

  it('produces manifest with entrypoint schemas and capabilities', () => {
    const card = buildManifest({
      meta,
      registry,
      origin: 'https://agent.example',
    });
    expect(card.name).toBe(meta.name);
    expect(card.url).toBe('https://agent.example/');
    expect(card.entrypoints.echo.streaming).toBe(true);
    expect(card.entrypoints.echo.input_schema).toBeTruthy();
    expect(card.capabilities?.streaming).toBe(true);
  });

  it('includes payments and trust metadata when provided', () => {
    const card = buildManifest({
      meta,
      registry,
      origin: 'https://agent.example',
      payments: {
        payTo: '0xabc0000000000000000000000000000000000000',
        facilitatorUrl: 'https://facilitator.example' as any,
        network: 'base-sepolia' as any,
        defaultPrice: '12',
      },
      trust: {
        registrations: [{ agentId: 1, agentAddress: 'eip155:8453:0xabc' }],
        trustModels: ['feedback', 'feedback'],
        validationRequestsUri: 'https://agent.example/req',
        validationResponsesUri: 'https://agent.example/res',
        feedbackDataUri: 'https://agent.example/feedback',
      },
    });
    expect(Array.isArray((card as any).payments)).toBe(true);
    expect(card.trustModels).toEqual(['feedback']);
    expect((card as any).ValidationRequestsURI).toBe(
      'https://agent.example/req'
    );
  });
});

describe('createAgentApp invoke/stream routes', () => {
  it('auto-registers entrypoints passed via options', async () => {
    const { app, addEntrypoint } = createAgentApp(meta, {
      entrypoints: [
        {
          key: 'startup',
          handler: async ({ input }) => ({
            output: { echoed: input.value ?? null },
          }),
        },
      ],
    });
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
    const { app, addEntrypoint } = createAgentApp(meta);
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
    const { app, addEntrypoint } = createAgentApp(meta);
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
    const { app, addEntrypoint } = createAgentApp(meta);
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
    const { app, addEntrypoint } = createAgentApp(meta, {
      payments: {
        payTo: '0xabc0000000000000000000000000000000000000',
        facilitatorUrl: 'https://facilitator.example' as any,
        network: 'base-sepolia' as any,
      },
    });

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

  it('still surfaces price in manifest without payments config', async () => {
    const { app, addEntrypoint } = createAgentApp(meta);

    addEntrypoint({
      key: 'priced-no-payments',
      price: '222',
      handler: async () => ({ output: { ok: true } }),
    });

    const res = await app.request('http://agent/.well-known/agent.json');
    expect(res.status).toBe(200);
    const manifest = await res.json();
    expect(manifest.entrypoints?.['priced-no-payments']?.pricing?.invoke).toBe(
      '222'
    );
  });

  it('requires payment when entrypoint price is set', async () => {
    const { app, addEntrypoint } = createAgentApp(meta, {
      payments: {
        payTo: '0xabc0000000000000000000000000000000000000',
        facilitatorUrl: 'https://facilitator.example' as any,
        network: 'base-sepolia' as any,
      },
    });

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

  it('auto-paywalls priced entrypoints using configured defaults', async () => {
    const { app, addEntrypoint } = createAgentApp(meta);

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
    const { app, addEntrypoint } = createAgentApp(meta);
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

  it('returns error when stream not supported', async () => {
    const { app, addEntrypoint } = createAgentApp(meta);
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
    const body = await res.json();
    expect(body.error.code).toBe('stream_not_supported');
  });
});
