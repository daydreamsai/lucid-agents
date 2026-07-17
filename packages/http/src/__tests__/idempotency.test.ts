import type {
  AgentRuntime,
  BuildContext,
  EntrypointDef,
} from '@lucid-agents/types/core';
import type {
  AgentHttpRuntime,
  HttpIdempotencyStore,
} from '@lucid-agents/types/http';
import type { PaymentsRuntime } from '@lucid-agents/types/payments';
import { describe, expect, it } from 'bun:test';

import { http } from '../extension';
import { createInMemoryHttpIdempotencyStore } from '../idempotency';
import { invoke, type InvokeOptions } from '../invoke';

const meta = { name: 'idempotency-agent', version: '1.0.0' };
const IDEMPOTENCY_KEY = 'idempotency-test-key-000001';

function makeRuntime(
  entrypoint: EntrypointDef,
  payments?: PaymentsRuntime
): AgentRuntime<{ payments?: PaymentsRuntime }> {
  return {
    agent: {
      config: { meta },
      getEntrypoint: key => (key === entrypoint.key ? entrypoint : undefined),
      listEntrypoints: () => [entrypoint],
    },
    entrypoints: {
      add: () => {},
      list: () => [
        {
          key: entrypoint.key,
          description: entrypoint.description,
          streaming: Boolean(entrypoint.stream),
        },
      ],
      snapshot: () => [entrypoint],
    },
    manifest: {
      build: () => ({ ...meta, entrypoints: {} }),
      invalidate: () => {},
    },
    close: async () => {},
    payments,
  } as AgentRuntime<{ payments?: PaymentsRuntime }>;
}

function request(
  input: unknown = { value: 1 },
  securityHeaders?: HeadersInit
): Request {
  const headers = new Headers(securityHeaders);
  headers.set('Content-Type', 'application/json');
  headers.set('Idempotency-Key', IDEMPOTENCY_KEY);
  return new Request('https://agent.test/entrypoints/work/invoke', {
    method: 'POST',
    headers,
    body: JSON.stringify({ input }),
  });
}

function invokeOptions(store: HttpIdempotencyStore): InvokeOptions {
  return {
    idempotency: {
      store,
      inProgressTtlMs: 60_000,
      retentionMs: 60_000,
    },
  };
}

describe('HTTP invoke idempotency', () => {
  it('is enabled by default and replays a completed response exactly once', async () => {
    let executions = 0;
    let finalizations = 0;
    const entrypoint: EntrypointDef = {
      key: 'work',
      handler: async () => {
        executions += 1;
        return { output: { executions } };
      },
    };
    const payments = {
      requirements: () => ({ required: false }),
      authorize: async () => ({
        authorized: true,
        admit: async () => ({
          admitted: true,
          abort: async () => {},
          finalize: async (response: Response) => {
            finalizations += 1;
            return response;
          },
        }),
      }),
    } as unknown as PaymentsRuntime;
    const runtime = makeRuntime(entrypoint, payments);
    const extension = http();
    const slice = extension.build({
      meta,
      runtime,
    } as BuildContext) as { http: AgentHttpRuntime };

    const first = await slice.http.handlers.invoke(request(), { key: 'work' });
    const second = await slice.http.handlers.invoke(request(), { key: 'work' });
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.headers.get('Idempotency-Replayed')).toBe('true');
    expect(secondBody).toEqual(firstBody);
    expect(executions).toBe(1);
    expect(finalizations).toBe(1);
    await extension.dispose?.(runtime);
  });

  it('rejects a concurrent duplicate while the first invocation is running', async () => {
    const store = createInMemoryHttpIdempotencyStore();
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => {
      entered = resolve;
    });
    const blocked = new Promise<void>(resolve => {
      release = resolve;
    });
    const entrypoint: EntrypointDef = {
      key: 'work',
      handler: async () => {
        entered();
        await blocked;
        return { output: { ok: true } };
      },
    };
    const runtime = makeRuntime(entrypoint);
    const firstPromise = invoke(
      request(),
      'work',
      runtime,
      invokeOptions(store)
    );
    await started;

    const duplicate = await invoke(
      request(),
      'work',
      runtime,
      invokeOptions(store)
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.headers.get('Retry-After')).toBe('1');
    release();
    expect((await firstPromise).status).toBe(200);
  });

  it('releases failed invocations so the same request can retry', async () => {
    const store = createInMemoryHttpIdempotencyStore();
    let executions = 0;
    const entrypoint: EntrypointDef = {
      key: 'work',
      handler: async () => {
        executions += 1;
        if (executions === 1) throw new Error('transient failure');
        return { output: { ok: true } };
      },
    };
    const runtime = makeRuntime(entrypoint);

    const first = await invoke(
      request(),
      'work',
      runtime,
      invokeOptions(store)
    );
    const retry = await invoke(
      request(),
      'work',
      runtime,
      invokeOptions(store)
    );

    expect(first.status).toBe(500);
    expect(retry.status).toBe(200);
    expect(executions).toBe(2);
  });

  it('rejects reuse of a completed key with a different request body', async () => {
    const store = createInMemoryHttpIdempotencyStore();
    const entrypoint: EntrypointDef = {
      key: 'work',
      handler: async context => ({ output: context.input }),
    };
    const runtime = makeRuntime(entrypoint);

    expect(
      (
        await invoke(
          request({ value: 1 }),
          'work',
          runtime,
          invokeOptions(store)
        )
      ).status
    ).toBe(200);
    const conflict = await invoke(
      request({ value: 2 }),
      'work',
      runtime,
      invokeOptions(store)
    );

    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({
      error: {
        code: 'idempotency_key_conflict',
        message: 'Idempotency-Key was already used for a different request',
      },
    });
  });

  it('does not replay a completed response across caller credentials', async () => {
    const store = createInMemoryHttpIdempotencyStore();
    let executions = 0;
    const runtime = makeRuntime({
      key: 'work',
      handler: async () => {
        executions += 1;
        return { output: { secret: 'caller-bound' } };
      },
    });

    const first = await invoke(
      request({ value: 1 }, { Authorization: 'Bearer caller-one' }),
      'work',
      runtime,
      invokeOptions(store)
    );
    const otherCaller = await invoke(
      request({ value: 1 }, { Authorization: 'Bearer caller-two' }),
      'work',
      runtime,
      invokeOptions(store)
    );

    expect(first.status).toBe(200);
    expect(otherCaller.status).toBe(409);
    expect(executions).toBe(1);
  });

  it('authorizes before claiming and replays paid retries for the same verified subject', async () => {
    const baseStore = createInMemoryHttpIdempotencyStore();
    let claims = 0;
    const store: HttpIdempotencyStore = {
      ...baseStore,
      claim: async (...args) => {
        claims += 1;
        return baseStore.claim(...args);
      },
    };
    let authorizationCalls = 0;
    let admissions = 0;
    let finalizations = 0;
    let aborts = 0;
    let executions = 0;
    const payments = {
      requirements: () => ({
        required: true,
        price: '1',
        network: 'eip155:84532',
        response: new Response(null, { status: 402 }),
      }),
      authorize: async (authorizedRequest: Request) => {
        authorizationCalls += 1;
        const credential = authorizedRequest.headers.get('PAYMENT-SIGNATURE');
        if (!credential) {
          return {
            authorized: false,
            response: new Response(null, { status: 402 }),
          } as const;
        }
        return {
          authorized: true,
          subject:
            'payment:eip155:84532:0x0000000000000000000000000000000000000001',
          admit: async () => {
            admissions += 1;
            return {
              admitted: true,
              abort: async () => {
                aborts += 1;
              },
              finalize: async (response: Response) => {
                finalizations += 1;
                return response;
              },
            } as const;
          },
        } as const;
      },
    } as unknown as PaymentsRuntime;
    const runtime = makeRuntime(
      {
        key: 'work',
        price: '1',
        paymentProtocol: 'x402',
        handler: async () => {
          executions += 1;
          return { output: { executions } };
        },
      },
      payments
    );

    const challenge = await invoke(
      request(),
      'work',
      runtime,
      invokeOptions(store)
    );
    const first = await invoke(
      request(undefined, { 'PAYMENT-SIGNATURE': 'credential-one' }),
      'work',
      runtime,
      invokeOptions(store)
    );
    const replay = await invoke(
      request(undefined, { 'PAYMENT-SIGNATURE': 'credential-two' }),
      'work',
      runtime,
      invokeOptions(store)
    );

    expect(challenge.status).toBe(402);
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.headers.get('Idempotency-Replayed')).toBe('true');
    expect(authorizationCalls).toBe(3);
    expect(claims).toBe(2);
    expect(admissions).toBe(1);
    expect(executions).toBe(1);
    expect(finalizations).toBe(1);
    expect(aborts).toBe(0);
  });

  it('does not admit provisional policy state when a verified subject conflicts', async () => {
    const store = createInMemoryHttpIdempotencyStore();
    let admissions = 0;
    let executions = 0;
    const payments = {
      requirements: () => ({ required: false }),
      authorize: async (authorizedRequest: Request) => ({
        authorized: true,
        subject: `api:${authorizedRequest.headers.get('X-Verified-Subject')}`,
        admit: async () => {
          admissions += 1;
          return {
            admitted: true,
            abort: async () => {},
            finalize: async (response: Response) => response,
          } as const;
        },
      }),
    } as unknown as PaymentsRuntime;
    const runtime = makeRuntime(
      {
        key: 'work',
        handler: async () => {
          executions += 1;
          return { output: { ok: true } };
        },
      },
      payments
    );

    const first = await invoke(
      request(undefined, { 'X-Verified-Subject': 'caller-one' }),
      'work',
      runtime,
      invokeOptions(store)
    );
    const conflict = await invoke(
      request(undefined, { 'X-Verified-Subject': 'caller-two' }),
      'work',
      runtime,
      invokeOptions(store)
    );

    expect(first.status).toBe(200);
    expect(conflict.status).toBe(409);
    expect(executions).toBe(1);
    expect(admissions).toBe(1);
  });

  it('retains the claim when recording a successful response fails', async () => {
    const base = createInMemoryHttpIdempotencyStore();
    const store: HttpIdempotencyStore = {
      ...base,
      complete: async () => {
        throw new Error('idempotency database unavailable');
      },
    };
    let executions = 0;
    const runtime = makeRuntime({
      key: 'work',
      handler: async () => {
        executions += 1;
        return { output: { ok: true } };
      },
    });

    const first = await invoke(
      request(),
      'work',
      runtime,
      invokeOptions(store)
    );
    const retry = await invoke(
      request(),
      'work',
      runtime,
      invokeOptions(store)
    );

    expect(first.status).toBe(503);
    expect(retry.status).toBe(409);
    expect(executions).toBe(1);
  });

  it('recovers successful output after a post-settlement recording failure', async () => {
    const store = createInMemoryHttpIdempotencyStore();
    let executions = 0;
    let admissions = 0;
    const payments = {
      requirements: () => ({ required: false }),
      authorize: async () => ({
        authorized: true,
        subject: 'payment:eip155:84532:0xsettled',
        admit: async () => {
          admissions += 1;
          let committed = false;
          return {
            admitted: true,
            abort: async () => {},
            isCommitted: () => committed,
            finalize: async () => {
              committed = true;
              return Response.json(
                {
                  error: {
                    code: 'payment_recording_failed',
                    message: 'accounting unavailable',
                  },
                },
                { status: 503 }
              );
            },
          } as const;
        },
      }),
    } as unknown as PaymentsRuntime;
    const runtime = makeRuntime(
      {
        key: 'work',
        handler: async () => {
          executions += 1;
          return { output: { ok: true } };
        },
      },
      payments
    );

    const first = await invoke(
      request(),
      'work',
      runtime,
      invokeOptions(store)
    );
    const replay = await invoke(
      request(),
      'work',
      runtime,
      invokeOptions(store)
    );

    expect(first.status).toBe(503);
    expect(replay.status).toBe(200);
    expect(replay.headers.get('Idempotency-Replayed')).toBe('true');
    expect(await replay.json()).toMatchObject({
      status: 'succeeded',
      output: { ok: true },
    });
    expect(executions).toBe(1);
    expect(admissions).toBe(1);
  });
});
