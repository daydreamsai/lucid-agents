import type { AgentRuntime, EntrypointDef } from '@lucid-agents/types/core';
import type { PaymentsRuntime } from '@lucid-agents/types/payments';
import type { AgentAuthContext } from '@lucid-agents/types/siwx';
import { describe, expect, it } from 'bun:test';

import type { AuthorizationRuntime } from '../authorization';
import { stream } from '../stream';

const meta = { name: 'stream-test', version: '1.0.0' };

function makeRuntime(
  entrypoint?: EntrypointDef,
  payments?: PaymentsRuntime
): AuthorizationRuntime {
  return {
    agent: {
      config: { meta },
      getEntrypoint: key => (entrypoint?.key === key ? entrypoint : undefined),
      listEntrypoints: () => (entrypoint ? [entrypoint] : []),
    },
    entrypoints: {
      add: () => {},
      list: () => [],
      snapshot: () => (entrypoint ? [entrypoint] : []),
    },
    manifest: {
      build: () => ({ ...meta, entrypoints: {} }),
      invalidate: () => {},
    },
    close: async () => {},
    payments,
  } as AgentRuntime<{ payments?: PaymentsRuntime }>;
}

function streamRequest(
  body: string = JSON.stringify({ input: { text: 'hi' } })
) {
  return new Request('https://agent.test/entrypoints/messages/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Test': 'present',
    },
    body,
  });
}

function envelopes(text: string): Array<Record<string, unknown>> {
  return text
    .split('\n')
    .filter(line => line.startsWith('data: '))
    .map(line => JSON.parse(line.slice('data: '.length)));
}

describe('HTTP stream execution', () => {
  it('rejects missing and non-streaming entrypoints', async () => {
    const missing = await stream(streamRequest(), 'messages', makeRuntime());
    const unsupported = await stream(
      streamRequest(),
      'messages',
      makeRuntime({ key: 'messages', handler: async () => ({ output: {} }) })
    );

    expect(missing.status).toBe(404);
    expect(unsupported.status).toBe(400);
    expect(await unsupported.json()).toEqual({
      error: { code: 'stream_not_supported', key: 'messages' },
    });
  });

  it('emits ordered envelopes with trusted auth and finalizes the response', async () => {
    const auth: AgentAuthContext = {
      scheme: 'siwx',
      address: '0xverified',
      chainId: 'eip155:84532',
      grantedBy: 'auth-only',
      payload: {},
    };
    let receivedAuth: AgentAuthContext | undefined;
    const receivedHeaders: Array<string | null> = [];
    const finalizedStatuses: number[] = [];
    const payments = {
      requirements: () => ({ required: false }),
      authorize: async () => ({
        authorized: true,
        admit: async () => ({
          admitted: true,
          abort: async () => {},
          finalize: async (response: Response) => {
            finalizedStatuses.push(response.status);
            const finalized = new Response(response.body, response);
            finalized.headers.set('X-Finalized', 'true');
            return finalized;
          },
        }),
      }),
    } as unknown as PaymentsRuntime;
    const entrypoint: EntrypointDef = {
      key: 'messages',
      stream: async (context, emit) => {
        receivedAuth = context.auth;
        receivedHeaders.push(
          (context.metadata?.headers as Headers | undefined)?.get(
            'X-Request-Test'
          ) ?? null
        );
        await emit({ kind: 'text', text: 'hello' });
        await emit({ kind: 'delta', delta: ' world', final: true });
        return {
          status: 'succeeded',
          output: { complete: true },
          usage: { total_tokens: 2 },
          model: 'test-model',
        };
      },
    };

    const response = await stream(
      streamRequest(),
      entrypoint.key,
      makeRuntime(entrypoint, payments),
      { auth }
    );
    const events = envelopes(await response.text());

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Finalized')).toBe('true');
    expect(finalizedStatuses).toEqual([200]);
    expect(receivedAuth).toEqual(auth);
    expect(receivedHeaders).toEqual(['present']);
    expect(events.map(event => event.kind)).toEqual([
      'run-start',
      'text',
      'delta',
      'run-end',
    ]);
    expect(events.map(event => event.sequence)).toEqual([0, 1, 2, 3]);
    expect(new Set(events.map(event => event.runId)).size).toBe(1);
    expect(events.every(event => typeof event.createdAt === 'string')).toBe(
      true
    );
    expect(events[events.length - 1]).toMatchObject({
      status: 'succeeded',
      output: { complete: true },
      usage: { total_tokens: 2 },
      model: 'test-model',
    });
  });

  it('turns handler exceptions into terminal SSE error envelopes', async () => {
    const response = await stream(
      streamRequest(),
      'messages',
      makeRuntime({
        key: 'messages',
        stream: async () => {
          throw new Error('stream failed');
        },
      })
    );
    const events = envelopes(await response.text());

    expect(response.status).toBe(200);
    expect(events.map(event => event.kind)).toEqual([
      'run-start',
      'error',
      'run-end',
    ]);
    expect(events[1]).toMatchObject({
      code: 'internal_error',
      message: 'stream failed',
    });
    expect(events[2]).toMatchObject({
      status: 'failed',
      error: { code: 'internal_error', message: 'stream failed' },
    });
  });

  it('returns deterministic authorization admission failures', async () => {
    const entrypoint: EntrypointDef = {
      key: 'messages',
      stream: async () => ({ status: 'succeeded' }),
    };
    const deniedPayments = {
      requirements: () => ({ required: false }),
      authorize: async () => ({
        authorized: false,
        response: Response.json({ error: 'payment required' }, { status: 402 }),
      }),
    } as unknown as PaymentsRuntime;
    const rejected = await stream(
      streamRequest(),
      entrypoint.key,
      makeRuntime(entrypoint, deniedPayments)
    );
    expect(rejected.status).toBe(402);

    const failingPayments = {
      requirements: () => ({ required: false }),
      authorize: async () => ({
        authorized: true,
        admit: async () => {
          throw new Error('policy store unavailable');
        },
      }),
    } as unknown as PaymentsRuntime;
    const failed = await stream(
      streamRequest(),
      entrypoint.key,
      makeRuntime(entrypoint, failingPayments)
    );

    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({
      error: {
        code: 'authorization_admission_failed',
        message: 'policy store unavailable',
      },
    });
  });
});
