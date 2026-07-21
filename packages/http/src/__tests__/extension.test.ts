import type { AgentRuntime, EntrypointDef } from '@lucid-agents/types/core';
import type { HttpIdempotencyStore } from '@lucid-agents/types/http';
import { describe, expect, it } from 'bun:test';

import { http } from '../extension';

const entrypoints: EntrypointDef[] = [
  { key: 'ping', description: 'Ping the agent' },
];

const makeRuntime = (withIdentity = true): AgentRuntime =>
  ({
    agent: {
      config: {
        meta: {
          name: 'HTTP test agent',
          version: '1.2.3',
          description: 'Exercises discovery handlers',
          icon: '<svg id="custom-favicon"></svg>',
        },
      },
      getEntrypoint(key: string) {
        return entrypoints.find(entrypoint => entrypoint.key === key);
      },
      listEntrypoints() {
        return entrypoints;
      },
    },
    entrypoints: {
      add() {},
      list() {
        return [
          { key: 'ping', description: 'Ping the agent', streaming: false },
        ];
      },
      snapshot() {
        return entrypoints;
      },
    },
    manifest: {
      build(publicBaseUrl: string) {
        return { name: 'HTTP test agent', url: publicBaseUrl };
      },
    },
    ...(withIdentity
      ? {
          identity: {
            buildOASFRecord(requestUrl: string) {
              return { record: 'oasf', requestUrl };
            },
          },
        }
      : {}),
  }) as unknown as AgentRuntime;

const buildHttp = (
  options: Parameters<typeof http>[0],
  runtime = makeRuntime()
) => {
  const extension = http(options);
  const result = extension.build!({ runtime } as never);
  if (result instanceof Promise) {
    throw new Error('Expected the HTTP extension to build synchronously');
  }
  return { extension, runtime: result.http };
};

describe('http extension discovery handlers', () => {
  it('builds canonical routes and serves health, discovery, landing, and favicon', async () => {
    const { runtime } = buildHttp({ basePath: '/api/agent/' });
    const request = new Request(
      'http://localhost:3000/api/agent/.well-known/agent-card.json',
      {
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'agent.example.com',
        },
      }
    );

    expect(runtime.basePath).toBe('/api/agent');
    expect(runtime.routes.map(route => route.id)).toContain('landing');
    expect(await runtime.handlers.health!(request).then(r => r.json())).toEqual(
      { ok: true, version: '1.2.3' }
    );
    expect(
      await runtime.handlers.entrypoints!(request).then(r => r.json())
    ).toEqual({
      items: [{ key: 'ping', description: 'Ping the agent', streaming: false }],
    });
    expect(
      await runtime.handlers.manifest!(request).then(r => r.json())
    ).toEqual({
      name: 'HTTP test agent',
      url: 'https://agent.example.com/api/agent',
    });
    expect(await runtime.handlers.oasf!(request).then(r => r.json())).toEqual({
      record: 'oasf',
      requestUrl: request.url,
    });

    const landing = await runtime.handlers.landing!(request);
    expect(landing.headers.get('content-type')).toBe(
      'text/html; charset=utf-8'
    );
    expect(await landing.text()).toContain('HTTP test agent');
    const favicon = await runtime.handlers.favicon!(request);
    expect(favicon.headers.get('content-type')).toBe(
      'image/svg+xml; charset=utf-8'
    );
    expect(await favicon.text()).toBe('<svg id="custom-favicon"></svg>');
  });

  it('returns a 404 OASF response when identity discovery is disabled', async () => {
    const { runtime } = buildHttp(undefined, makeRuntime(false));
    const response = await runtime.handlers.oasf!(
      new Request('https://agent.example.com/.well-known/oasf-record.json')
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: 'not_found', message: 'OASF record is not enabled' },
    });
  });

  it('supports a root base path and disabling landing and idempotency', () => {
    const { runtime } = buildHttp({
      basePath: '/',
      landingPage: false,
      idempotency: false,
    });

    expect(runtime.basePath).toBe('');
    expect(runtime.handlers.landing).toBeUndefined();
    expect(runtime.routes.map(route => route.id)).not.toContain('landing');
  });

  it('uses the typed service page config and supports the canonical headless flag', async () => {
    const themed = buildHttp({ servicePage: { preset: 'folio' } }).runtime;
    const request = new Request('https://agent.example.com/');
    const page = await themed.handlers.landing!(request).then(response =>
      response.text()
    );

    expect(page).toContain('data-service-ui-preset="folio"');

    const headless = buildHttp({ servicePage: false }).runtime;
    expect(headless.handlers.landing).toBeUndefined();
    expect(headless.routes.map(route => route.id)).not.toContain('landing');
  });

  it('validates idempotency durations', () => {
    expect(() => http({ idempotency: { inProgressTtlMs: 0 } })).toThrow(
      'inProgressTtlMs must be a positive number'
    );
    expect(() =>
      http({ idempotency: { retentionMs: Number.POSITIVE_INFINITY } })
    ).toThrow('retentionMs must be a positive number');
  });

  it('closes an injected idempotency store during disposal', async () => {
    let closes = 0;
    const store: HttpIdempotencyStore = {
      async claim() {
        return { state: 'claimed' };
      },
      async complete() {
        return true;
      },
      async release() {},
      close() {
        closes += 1;
      },
    };
    const { extension } = buildHttp({ idempotency: { store } });

    await extension.dispose?.({} as never);
    expect(closes).toBe(1);
  });
});

describe('http extension entrypoint validation', () => {
  const capabilities = {
    payments: {},
    mpp: {},
  } as unknown as AgentRuntime;

  it('requires a payment protocol when x402 and MPP are both installed', () => {
    const extension = http();

    expect(() =>
      extension.onEntrypointAdded?.(
        { key: 'paid', price: { invoke: '1' } },
        capabilities
      )
    ).toThrow('Set paymentProtocol to "x402" or "mpp"');
    expect(() =>
      extension.onEntrypointAdded?.(
        { key: 'stream', price: { stream: '1' }, paymentProtocol: 'mpp' },
        capabilities
      )
    ).not.toThrow();
    expect(() =>
      extension.onEntrypointAdded?.({ key: 'free' }, capabilities)
    ).not.toThrow();
  });

  it('requires an enabled SIWX runtime for auth-only entrypoints', () => {
    const extension = http();
    expect(() =>
      extension.onEntrypointAdded?.(
        { key: 'profile', siwx: { authOnly: true } },
        {} as AgentRuntime
      )
    ).toThrow('no enabled SIWX runtime');
    expect(() =>
      extension.onEntrypointAdded?.(
        { key: 'profile', siwx: { authOnly: true } },
        {
          payments: {
            siwxConfig: { enabled: true },
            siwxStorage: {},
          },
        } as unknown as AgentRuntime
      )
    ).not.toThrow();
  });
});
