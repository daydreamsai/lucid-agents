import { randomUUID } from 'node:crypto';

import type {
  A2ARuntime,
  SendMessageRequest,
  Task,
  TaskStore,
  TaskStatus,
} from '@lucid-agents/types/a2a';
import type { AgentRuntime, EntrypointDef } from '@lucid-agents/types/core';
import type { AgentHttpRuntime } from '@lucid-agents/types/http';
import type { MppRuntime } from '@lucid-agents/types/mpp';
import type { PaymentsRuntime } from '@lucid-agents/types/payments';
import { buildChallengeResponse, decodeMppCredential } from '@lucid-agents/mpp';
import { describe, expect, it } from 'bun:test';
import { Challenge, Credential } from 'mppx';
import { z } from 'zod';

import { http } from '../index';
import type { InvokeResult } from '../invoke';
import { createInMemoryTaskStore, createTaskRuntime } from '@lucid-agents/a2a';

const meta = {
  name: 'test-agent',
  version: '1.0.0',
  description: 'Test agent',
};
const TASK_ACCESS_TOKEN = 'http-task-access-token-0001';

function createDurableTestTaskStore(options: { maxTasks: number }): TaskStore {
  return {
    ...createInMemoryTaskStore(options),
    durability: 'durable',
    close() {
      // The test store survives individual runtime instances.
    },
  };
}

function withTaskAccess(request: Request): Request {
  const headers = new Headers(request.headers);
  headers.set('Task-Access-Token', TASK_ACCESS_TOKEN);
  return new Request(request, { headers });
}

const makeMockRuntime = (
  entrypoints: Map<string, EntrypointDef>,
  invokeFn?: (
    key: string,
    input: unknown,
    options: any
  ) => Promise<InvokeResult>
): AgentRuntime => {
  const defaultInvoke = async (
    key: string,
    input: unknown,
    options: any
  ): Promise<InvokeResult> => {
    const entrypoint = entrypoints.get(key);
    if (!entrypoint || !entrypoint.handler) {
      throw new Error(`Entrypoint ${key} not found or has no handler`);
    }

    // Call the actual handler from the entrypoint
    const ctx = {
      key,
      input,
      signal: options.signal,
      metadata: {
        headers: options.headers || new Headers(),
      },
      runId: options.runId,
      runtime: options.runtime,
    };

    return await entrypoint.handler(ctx as any);
  };

  return {
    agent: {
      config: { meta },
      addEntrypoint: (def: EntrypointDef) => {
        entrypoints.set(def.key, def);
      },
      getEntrypoint: (key: string) => entrypoints.get(key),
      listEntrypoints: () => Array.from(entrypoints.values()),
      invoke: invokeFn || defaultInvoke,
    },
    entrypoints: {
      add: (def: EntrypointDef) => {
        entrypoints.set(def.key, def);
      },
      list: () =>
        Array.from(entrypoints.values()).map(e => ({
          key: e.key,
          description: e.description,
          streaming: Boolean(e.stream),
        })),
      snapshot: () => Array.from(entrypoints.values()),
    },
    manifest: {
      build: () => ({
        name: meta.name,
        version: meta.version,
        entrypoints: {},
      }),
      invalidate: () => {},
    },
    close: async () => {},
  } as AgentRuntime;
};

const makeTestHandlers = (
  invokeFn?: (
    key: string,
    input: unknown,
    options: any
  ) => Promise<InvokeResult>
) => {
  const entrypoints = new Map<string, EntrypointDef>();
  const ext = http();
  const runtime = makeMockRuntime(entrypoints, invokeFn) as AgentRuntime<{
    a2a: A2ARuntime;
  }>;
  runtime.a2a = {
    tasks: createTaskRuntime({
      store: createDurableTestTaskStore({ maxTasks: 1_000 }),
    }),
  } as A2ARuntime;
  const slice = ext.build({ meta, runtime }) as {
    http: AgentHttpRuntime;
  };
  const rawHandlers = slice.http.handlers;
  const handlers: AgentHttpRuntime['handlers'] = {
    ...rawHandlers,
    tasks: request => rawHandlers.tasks(withTaskAccess(request)),
    getTask: (request, params) =>
      rawHandlers.getTask(withTaskAccess(request), params),
    listTasks: request => rawHandlers.listTasks(withTaskAccess(request)),
    cancelTask: (request, params) =>
      rawHandlers.cancelTask(withTaskAccess(request), params),
    subscribeTask: (request, params) =>
      rawHandlers.subscribeTask(withTaskAccess(request), params),
  };
  return {
    handlers,
    rawHandlers,
    runtime,
    entrypoints,
  };
};

describe('Task Operations', () => {
  it('requires the opaque owner capability for task reads and lists', async () => {
    const { rawHandlers, entrypoints } = makeTestHandlers();
    entrypoints.set('owned', {
      key: 'owned',
      handler: async () => ({ output: { ok: true } }),
    });
    const createResponse = await rawHandlers.tasks(
      new Request('http://localhost/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Task-Access-Token': TASK_ACCESS_TOKEN,
        },
        body: JSON.stringify({
          skillId: 'owned',
          message: { role: 'user', content: { text: '{}' } },
        }),
      })
    );
    const created = (await createResponse.json()) as {
      taskId: string;
      accessToken: string;
    };
    expect(created.accessToken).toBe(TASK_ACCESS_TOKEN);

    const missing = await rawHandlers.getTask(
      new Request(`http://localhost/tasks/${created.taskId}`),
      { taskId: created.taskId }
    );
    expect(missing.status).toBe(401);

    const wrong = await rawHandlers.getTask(
      new Request(`http://localhost/tasks/${created.taskId}`, {
        headers: { 'Task-Access-Token': 'http-task-access-token-wrong' },
      }),
      { taskId: created.taskId }
    );
    expect(wrong.status).toBe(404);

    const wrongList = await rawHandlers.listTasks(
      new Request('http://localhost/tasks', {
        headers: { 'Task-Access-Token': 'http-task-access-token-wrong' },
      })
    );
    expect((await wrongList.json()).tasks).toEqual([]);
  });

  describe('POST /tasks - Create Task', () => {
    it('rejects paid tasks before authorization on a process-local store', async () => {
      const { rawHandlers, runtime, entrypoints } = makeTestHandlers();
      runtime.a2a.tasks = createTaskRuntime({
        store: createInMemoryTaskStore({ maxTasks: 1 }),
      });
      entrypoints.set('paid-process-task', {
        key: 'paid-process-task',
        price: '1',
        handler: async () => ({ output: { ok: true } }),
      });
      let authorizations = 0;
      (
        runtime as AgentRuntime<{
          a2a: A2ARuntime;
          payments: PaymentsRuntime;
        }>
      ).payments = {
        requirements: () => ({ required: false }),
        authorize: async () => {
          authorizations += 1;
          return {
            authorized: true,
            admit: async () => ({
              admitted: true,
              abort: async () => {},
              finalize: async (response: Response) => response,
            }),
          };
        },
      } as unknown as PaymentsRuntime;

      const response = await rawHandlers.tasks(
        new Request('http://localhost/tasks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Task-Access-Token': TASK_ACCESS_TOKEN,
          },
          body: JSON.stringify({
            skillId: 'paid-process-task',
            message: { role: 'user', content: { text: '{}' } },
          }),
        })
      );

      expect(response.status).toBe(503);
      expect((await response.json()).error.code).toBe(
        'durable_task_store_required'
      );
      expect(authorizations).toBe(0);
      await runtime.a2a.tasks.close();
    });

    it('requires a caller-known capability for paid tasks before authorization', async () => {
      const { rawHandlers, runtime, entrypoints } = makeTestHandlers();
      entrypoints.set('paid-task-without-capability', {
        key: 'paid-task-without-capability',
        price: '1',
        handler: async () => ({ output: { ok: true } }),
      });
      let authorizations = 0;
      (
        runtime as AgentRuntime<{
          a2a: A2ARuntime;
          payments: PaymentsRuntime;
        }>
      ).payments = {
        requirements: () => ({ required: false }),
        authorize: async () => {
          authorizations += 1;
          throw new Error('authorization must not run');
        },
      } as unknown as PaymentsRuntime;

      const response = await rawHandlers.tasks(
        new Request('http://localhost/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skillId: 'paid-task-without-capability',
            message: { role: 'user', content: { text: '{}' } },
          }),
        })
      );

      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe('task_access_required');
      expect(authorizations).toBe(0);
      await runtime.a2a.tasks.close();
    });

    it('continues to generate a capability for unpaid tasks', async () => {
      const { rawHandlers, runtime, entrypoints } = makeTestHandlers();
      entrypoints.set('free-task-without-capability', {
        key: 'free-task-without-capability',
        handler: async () => ({ output: { ok: true } }),
      });

      const response = await rawHandlers.tasks(
        new Request('http://localhost/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skillId: 'free-task-without-capability',
            message: { role: 'user', content: { text: '{}' } },
          }),
        })
      );

      expect(response.status).toBe(200);
      const created = (await response.json()) as {
        taskId: string;
        accessToken: string;
      };
      expect(created.accessToken.length).toBeGreaterThanOrEqual(20);
      expect(
        await runtime.a2a.tasks.get(created.taskId, created.accessToken)
      ).toBeDefined();
      await runtime.a2a.tasks.close();
    });

    it('keeps unpaid tasks available on the default process-local store', async () => {
      const { rawHandlers, runtime, entrypoints } = makeTestHandlers();
      runtime.a2a.tasks = createTaskRuntime({
        store: createInMemoryTaskStore({ maxTasks: 1 }),
      });
      entrypoints.set('free-process-task', {
        key: 'free-process-task',
        handler: async () => ({ output: { ok: true } }),
      });

      const response = await rawHandlers.tasks(
        new Request('http://localhost/tasks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Task-Access-Token': TASK_ACCESS_TOKEN,
          },
          body: JSON.stringify({
            skillId: 'free-process-task',
            message: { role: 'user', content: { text: '{}' } },
          }),
        })
      );

      expect(response.status).toBe(200);
      const access = (await response.json()) as {
        taskId: string;
        accessToken: string;
      };
      await Bun.sleep(1);
      const stored = await runtime.a2a.tasks.get(
        access.taskId,
        access.accessToken
      );
      expect(stored).toMatchObject({
        status: 'completed',
        result: { output: { ok: true } },
      });
      await runtime.a2a.tasks.close();
    });

    it('returns a settled terminal capability when execution activation fails', async () => {
      const { rawHandlers, runtime, entrypoints } = makeTestHandlers();
      entrypoints.set('paid-task', {
        key: 'paid-task',
        price: '1',
        handler: async () => ({ output: { ok: true } }),
      });

      const baseStore = createDurableTestTaskStore({ maxTasks: 1 });
      let rejectNextActivation = true;
      const store: TaskStore = {
        ...baseStore,
        activateExecution: async (...args) => {
          if (rejectNextActivation) {
            rejectNextActivation = false;
            throw new Error('execution lease unavailable');
          }
          return baseStore.activateExecution(...args);
        },
      };
      runtime.a2a.tasks = createTaskRuntime({ store });

      let paymentState: 'available' | 'reserved' | 'consumed' = 'available';
      (
        runtime as AgentRuntime<{
          a2a: A2ARuntime;
          payments: PaymentsRuntime;
        }>
      ).payments = {
        requirements: () => ({ required: false }),
        authorize: async () => {
          if (paymentState !== 'available') {
            return {
              authorized: false,
              response: Response.json(
                {
                  error: {
                    code:
                      paymentState === 'consumed'
                        ? 'payment_already_consumed'
                        : 'payment_still_reserved',
                    message:
                      paymentState === 'consumed'
                        ? 'The payment was already consumed'
                        : 'The payment reservation was not released',
                  },
                },
                { status: paymentState === 'consumed' ? 409 : 429 }
              ),
            };
          }
          return {
            authorized: true,
            admit: async () => {
              paymentState = 'reserved';
              return {
                admitted: true,
                abort: async () => {
                  paymentState = 'available';
                },
                isCommitted: () => paymentState === 'consumed',
                finalize: async (response: Response) => {
                  if (response.status < 200 || response.status >= 300) {
                    paymentState = 'available';
                    return response;
                  }
                  paymentState = 'consumed';
                  const settled = new Response(response.body, response);
                  settled.headers.set(
                    'X-Payment-Response',
                    'settlement-receipt'
                  );
                  return settled;
                },
              };
            },
          };
        },
      } as unknown as PaymentsRuntime;

      const request = () =>
        new Request('http://localhost/tasks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Task-Access-Token': TASK_ACCESS_TOKEN,
          },
          body: JSON.stringify({
            skillId: 'paid-task',
            message: { role: 'user', content: { text: '{}' } },
          }),
        });

      const failed = await rawHandlers.tasks(request());
      expect(failed.status).toBe(200);
      expect(failed.headers.get('X-Payment-Response')).toBe(
        'settlement-receipt'
      );
      const failedAccess = (await failed.json()) as {
        taskId: string;
        accessToken: string;
        status: TaskStatus;
      };
      expect(failedAccess.status).toBe('cancelled');
      const failedList = await rawHandlers.listTasks(
        new Request('http://localhost/tasks', {
          headers: { 'Task-Access-Token': TASK_ACCESS_TOKEN },
        })
      );
      const [failedTask] = ((await failedList.json()) as { tasks: Task[] })
        .tasks;
      expect(failedTask?.status).toBe('cancelled');
      const failedTaskResponse = await rawHandlers.getTask(
        new Request(`http://localhost/tasks/${failedTask?.taskId}`, {
          headers: { 'Task-Access-Token': TASK_ACCESS_TOKEN },
        }),
        { taskId: failedTask?.taskId ?? '' }
      );
      expect(failedTaskResponse.status).toBe(200);
      expect(((await failedTaskResponse.json()) as Task).status).toBe(
        'cancelled'
      );

      const retried = await rawHandlers.tasks(request());
      expect(retried.status).toBe(409);
      expect((await retried.json()).error.code).toBe(
        'payment_already_consumed'
      );

      await runtime.a2a.tasks.close();
    });

    it('preserves the task capability when committed settlement accounting fails', async () => {
      const { rawHandlers, runtime, entrypoints } = makeTestHandlers();
      entrypoints.set('settled-task', {
        key: 'settled-task',
        price: '1',
        handler: async () => ({ output: { ok: true } }),
      });

      let committed = false;
      (
        runtime as AgentRuntime<{
          a2a: A2ARuntime;
          payments: PaymentsRuntime;
        }>
      ).payments = {
        requirements: () => ({ required: false }),
        authorize: async () => ({
          authorized: true,
          admit: async () => ({
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
                {
                  status: 503,
                  headers: {
                    'X-Payment-Response': 'committed-settlement-receipt',
                  },
                }
              );
            },
          }),
        }),
      } as unknown as PaymentsRuntime;

      const response = await rawHandlers.tasks(
        new Request('http://localhost/tasks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Task-Access-Token': TASK_ACCESS_TOKEN,
          },
          body: JSON.stringify({
            skillId: 'settled-task',
            message: { role: 'user', content: { text: '{}' } },
          }),
        })
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('X-Payment-Response')).toBe(
        'committed-settlement-receipt'
      );
      const access = (await response.json()) as {
        taskId: string;
        accessToken: string;
      };
      const task = await rawHandlers.getTask(
        new Request(`http://localhost/tasks/${access.taskId}`, {
          headers: { 'Task-Access-Token': access.accessToken },
        }),
        { taskId: access.taskId }
      );
      expect(task.status).toBe(200);

      await runtime.a2a.tasks.close();
    });

    it('preserves a pre-settled MPP receipt and terminal task when execution admission fails', async () => {
      const { rawHandlers, runtime, entrypoints } = makeTestHandlers();
      entrypoints.set('mpp-task', {
        key: 'mpp-task',
        price: '1',
        paymentProtocol: 'mpp',
        handler: async () => ({ output: { ok: true } }),
      });

      const baseStore = createDurableTestTaskStore({ maxTasks: 1 });
      runtime.a2a.tasks = createTaskRuntime({
        store: {
          ...baseStore,
          activateExecution: async () => {
            throw new Error('execution lease unavailable');
          },
        },
      });
      (
        runtime as AgentRuntime<{
          a2a: A2ARuntime;
          mpp: MppRuntime;
        }>
      ).mpp = {
        requirements: () => ({
          required: true,
          amount: '1',
          currency: 'usd',
          intent: 'charge',
          methods: ['test'],
        }),
        authorize: async () => ({
          authorized: true,
          receipt: 'mpp-settlement-receipt',
        }),
      } as unknown as MppRuntime;

      const response = await rawHandlers.tasks(
        new Request('http://localhost/tasks', {
          method: 'POST',
          headers: {
            Authorization: 'Payment credential-bearing-request',
            'Content-Type': 'application/json',
            'Task-Access-Token': TASK_ACCESS_TOKEN,
          },
          body: JSON.stringify({
            skillId: 'mpp-task',
            message: { role: 'user', content: { text: '{}' } },
          }),
        })
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('Payment-Receipt')).toBe(
        'mpp-settlement-receipt'
      );
      const access = (await response.json()) as {
        taskId: string;
        accessToken: string;
        status: TaskStatus;
      };
      expect(access.status).toBe('cancelled');
      const taskResponse = await rawHandlers.getTask(
        new Request(`http://localhost/tasks/${access.taskId}`, {
          headers: { 'Task-Access-Token': access.accessToken },
        }),
        { taskId: access.taskId }
      );
      expect(taskResponse.status).toBe(200);
      expect(((await taskResponse.json()) as Task).status).toBe('cancelled');

      await runtime.a2a.tasks.close();
    });

    it('rejects MPP credential work at capacity before returning a receipt', async () => {
      const { rawHandlers, runtime, entrypoints } = makeTestHandlers();
      entrypoints.set('mpp-capacity', {
        key: 'mpp-capacity',
        price: '1',
        paymentProtocol: 'mpp',
        handler: async () => ({ output: { ok: true } }),
      });
      runtime.a2a.tasks = createTaskRuntime({
        store: createDurableTestTaskStore({ maxTasks: 1 }),
      });
      await runtime.a2a.tasks.reserve({
        taskId: 'occupied-task',
        accessToken: TASK_ACCESS_TOKEN,
      });
      const challenge = Challenge.fromResponse(
        buildChallengeResponse({
          amount: '1',
          currency: 'usd',
          intent: 'charge',
          methods: ['test'],
          realm: 'localhost',
        })
      );
      const credential = Credential.serialize({
        challenge,
        payload: { proof: true },
      });
      let authorizations = 0;
      (
        runtime as AgentRuntime<{
          a2a: A2ARuntime;
          mpp: MppRuntime;
        }>
      ).mpp = {
        requirements: () => ({
          required: true,
          amount: '1',
          currency: 'usd',
          intent: 'charge',
          methods: ['test'],
        }),
        hasCredential: (request: Request) =>
          decodeMppCredential(request) !== null,
        authorize: async () => {
          authorizations += 1;
          return {
            authorized: true,
            receipt: 'must-not-be-committed',
          };
        },
      } as unknown as MppRuntime;

      const response = await rawHandlers.tasks(
        new Request('http://localhost/tasks', {
          method: 'POST',
          headers: {
            Authorization: `Bearer caller-token, ${credential}`,
            'Content-Type': 'application/json',
            'Task-Access-Token': TASK_ACCESS_TOKEN,
          },
          body: JSON.stringify({
            skillId: 'mpp-capacity',
            message: { role: 'user', content: { text: '{}' } },
          }),
        })
      );

      expect(response.status).toBe(503);
      expect(response.headers.get('Payment-Receipt')).toBeNull();
      expect(await response.json()).toMatchObject({
        error: { code: 'task_capacity_exhausted' },
      });
      expect(authorizations).toBe(0);

      await runtime.a2a.tasks.close();
    });

    it('does not reserve task capacity for an initial MPP challenge', async () => {
      const { rawHandlers, runtime, entrypoints } = makeTestHandlers();
      entrypoints.set('mpp-challenge', {
        key: 'mpp-challenge',
        price: '1',
        paymentProtocol: 'mpp',
        handler: async () => ({ output: { ok: true } }),
      });
      runtime.a2a.tasks = createTaskRuntime({
        store: createDurableTestTaskStore({ maxTasks: 1 }),
      });
      await runtime.a2a.tasks.reserve({
        taskId: 'occupied-task',
        accessToken: TASK_ACCESS_TOKEN,
      });
      (
        runtime as AgentRuntime<{
          a2a: A2ARuntime;
          mpp: MppRuntime;
        }>
      ).mpp = {
        requirements: () => ({
          required: true,
          amount: '1',
          currency: 'usd',
          intent: 'charge',
          methods: ['test'],
        }),
        authorize: async () => ({
          authorized: false,
          response: new Response(null, {
            status: 402,
            headers: { 'WWW-Authenticate': 'Payment challenge' },
          }),
        }),
      } as unknown as MppRuntime;

      const response = await rawHandlers.tasks(
        new Request('http://localhost/tasks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Task-Access-Token': TASK_ACCESS_TOKEN,
          },
          body: JSON.stringify({
            skillId: 'mpp-challenge',
            message: { role: 'user', content: { text: '{}' } },
          }),
        })
      );

      expect(response.status).toBe(402);
      expect(response.headers.get('WWW-Authenticate')).toBe(
        'Payment challenge'
      );

      await runtime.a2a.tasks.close();
    });

    it('releases a pre-reserved task after uncommitted MPP rejection', async () => {
      const { rawHandlers, runtime, entrypoints } = makeTestHandlers();
      entrypoints.set('mpp-retry', {
        key: 'mpp-retry',
        price: '1',
        paymentProtocol: 'mpp',
        handler: async () => ({ output: { ok: true } }),
      });
      runtime.a2a.tasks = createTaskRuntime({
        store: createDurableTestTaskStore({ maxTasks: 1 }),
      });
      let rejectCredential = true;
      (
        runtime as AgentRuntime<{
          a2a: A2ARuntime;
          mpp: MppRuntime;
        }>
      ).mpp = {
        requirements: () => ({
          required: true,
          amount: '1',
          currency: 'usd',
          intent: 'charge',
          methods: ['test'],
        }),
        authorize: async () =>
          rejectCredential
            ? {
                authorized: false as const,
                response: new Response(null, { status: 402 }),
              }
            : {
                authorized: true as const,
                receipt: 'retry-settlement-receipt',
              },
      } as unknown as MppRuntime;

      const request = () =>
        new Request('http://localhost/tasks', {
          method: 'POST',
          headers: {
            Authorization: 'Payment credential-bearing-request',
            'Content-Type': 'application/json',
            'Task-Access-Token': TASK_ACCESS_TOKEN,
          },
          body: JSON.stringify({
            skillId: 'mpp-retry',
            message: { role: 'user', content: { text: '{}' } },
          }),
        });

      const rejected = await rawHandlers.tasks(request());
      expect(rejected.status).toBe(402);
      expect(rejected.headers.get('Payment-Receipt')).toBeNull();

      rejectCredential = false;
      const retried = await rawHandlers.tasks(request());
      expect(retried.status).toBe(200);
      expect(retried.headers.get('Payment-Receipt')).toBe(
        'retry-settlement-receipt'
      );

      await runtime.a2a.tasks.close();
    });

    it('returns a terminal task capability for an MPP handled response', async () => {
      const { rawHandlers, runtime, entrypoints } = makeTestHandlers();
      entrypoints.set('mpp-handled', {
        key: 'mpp-handled',
        price: '1',
        paymentProtocol: 'mpp',
        handler: async () => ({ output: { ok: true } }),
      });
      (
        runtime as AgentRuntime<{
          a2a: A2ARuntime;
          mpp: MppRuntime;
        }>
      ).mpp = {
        requirements: () => ({
          required: true,
          amount: '1',
          currency: 'usd',
          intent: 'session',
          methods: ['test'],
        }),
        authorize: async () => ({
          authorized: true,
          receipt: 'handled-mpp-receipt',
          handled: new Response(null, {
            status: 204,
            headers: { 'Payment-Receipt': 'handled-mpp-receipt' },
          }),
        }),
      } as unknown as MppRuntime;

      const response = await rawHandlers.tasks(
        new Request('http://localhost/tasks', {
          method: 'POST',
          headers: {
            Authorization: 'Payment credential-bearing-request',
            'Content-Type': 'application/json',
            'Task-Access-Token': TASK_ACCESS_TOKEN,
          },
          body: JSON.stringify({
            skillId: 'mpp-handled',
            message: { role: 'user', content: { text: '{}' } },
          }),
        })
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('Payment-Receipt')).toBe(
        'handled-mpp-receipt'
      );
      const access = (await response.json()) as {
        taskId: string;
        accessToken: string;
        status: TaskStatus;
      };
      expect(access.status).toBe('cancelled');
      const taskResponse = await rawHandlers.getTask(
        new Request(`http://localhost/tasks/${access.taskId}`, {
          headers: { 'Task-Access-Token': access.accessToken },
        }),
        { taskId: access.taskId }
      );
      expect(((await taskResponse.json()) as Task).status).toBe('cancelled');

      await runtime.a2a.tasks.close();
    });

    it('returns a terminal MPP capability when post-payment admission rejects', async () => {
      const { rawHandlers, runtime, entrypoints } = makeTestHandlers();
      entrypoints.set('mpp-rejected', {
        key: 'mpp-rejected',
        price: '1',
        paymentProtocol: 'mpp',
        handler: async () => ({ output: { ok: true } }),
      });
      const paidRuntime = runtime as AgentRuntime<{
        a2a: A2ARuntime;
        mpp: MppRuntime;
        payments: PaymentsRuntime;
      }>;
      paidRuntime.mpp = {
        requirements: () => ({
          required: true,
          amount: '1',
          currency: 'usd',
          intent: 'charge',
          methods: ['test'],
        }),
        authorize: async () => ({
          authorized: true,
          receipt: 'rejected-admission-receipt',
        }),
      } as unknown as MppRuntime;
      paidRuntime.payments = {
        requirements: () => ({ required: false }),
        authorize: async () => ({
          authorized: true,
          admit: async () => ({
            admitted: false,
            response: Response.json(
              {
                error: {
                  code: 'policy_violation',
                  message: 'Payment policy rejected the task',
                },
              },
              { status: 403 }
            ),
          }),
        }),
      } as unknown as PaymentsRuntime;

      const response = await rawHandlers.tasks(
        new Request('http://localhost/tasks', {
          method: 'POST',
          headers: {
            Authorization: 'Payment credential-bearing-request',
            'Content-Type': 'application/json',
            'Task-Access-Token': TASK_ACCESS_TOKEN,
          },
          body: JSON.stringify({
            skillId: 'mpp-rejected',
            message: { role: 'user', content: { text: '{}' } },
          }),
        })
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('Payment-Receipt')).toBe(
        'rejected-admission-receipt'
      );
      const access = (await response.json()) as {
        taskId: string;
        accessToken: string;
        status: TaskStatus;
      };
      expect(access.status).toBe('cancelled');
      const taskResponse = await rawHandlers.getTask(
        new Request(`http://localhost/tasks/${access.taskId}`, {
          headers: { 'Task-Access-Token': access.accessToken },
        }),
        { taskId: access.taskId }
      );
      expect(((await taskResponse.json()) as Task).status).toBe('cancelled');

      await runtime.a2a.tasks.close();
    });

    it('returns a terminal MPP capability when post-payment admission throws', async () => {
      const { rawHandlers, runtime, entrypoints } = makeTestHandlers();
      entrypoints.set('mpp-admission-error', {
        key: 'mpp-admission-error',
        price: '1',
        paymentProtocol: 'mpp',
        handler: async () => ({ output: { ok: true } }),
      });
      const paidRuntime = runtime as AgentRuntime<{
        a2a: A2ARuntime;
        mpp: MppRuntime;
        payments: PaymentsRuntime;
      }>;
      paidRuntime.mpp = {
        requirements: () => ({
          required: true,
          amount: '1',
          currency: 'usd',
          intent: 'charge',
          methods: ['test'],
        }),
        authorize: async () => ({
          authorized: true,
          receipt: 'thrown-admission-receipt',
        }),
      } as unknown as MppRuntime;
      paidRuntime.payments = {
        requirements: () => ({ required: false }),
        authorize: async () => ({
          authorized: true,
          admit: async () => {
            throw new Error('payment policy unavailable');
          },
        }),
      } as unknown as PaymentsRuntime;

      const response = await rawHandlers.tasks(
        new Request('http://localhost/tasks', {
          method: 'POST',
          headers: {
            Authorization: 'Payment credential-bearing-request',
            'Content-Type': 'application/json',
            'Task-Access-Token': TASK_ACCESS_TOKEN,
          },
          body: JSON.stringify({
            skillId: 'mpp-admission-error',
            message: { role: 'user', content: { text: '{}' } },
          }),
        })
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('Payment-Receipt')).toBe(
        'thrown-admission-receipt'
      );
      const access = (await response.json()) as {
        taskId: string;
        accessToken: string;
        status: TaskStatus;
      };
      expect(access.status).toBe('cancelled');
      const taskResponse = await rawHandlers.getTask(
        new Request(`http://localhost/tasks/${access.taskId}`, {
          headers: { 'Task-Access-Token': access.accessToken },
        }),
        { taskId: access.taskId }
      );
      expect(((await taskResponse.json()) as Task).status).toBe('cancelled');

      await runtime.a2a.tasks.close();
    });

    it('cancels admitted work and releases capacity when settlement fails', async () => {
      const { rawHandlers, runtime, entrypoints } = makeTestHandlers();
      entrypoints.set('settlement-task', {
        key: 'settlement-task',
        price: '1',
        handler: async () => ({ output: { ok: true } }),
      });
      runtime.a2a.tasks = createTaskRuntime({
        store: createDurableTestTaskStore({ maxTasks: 1 }),
      });

      let failNextSettlement = true;
      let paymentReserved = false;
      (
        runtime as AgentRuntime<{
          a2a: A2ARuntime;
          payments: PaymentsRuntime;
        }>
      ).payments = {
        requirements: () => ({ required: false }),
        authorize: async () => {
          if (paymentReserved) {
            return {
              authorized: false,
              response: Response.json(
                {
                  error: {
                    code: 'payment_still_reserved',
                    message: 'The payment reservation was not released',
                  },
                },
                { status: 429 }
              ),
            };
          }
          return {
            authorized: true,
            admit: async () => {
              paymentReserved = true;
              return {
                admitted: true,
                abort: async () => {
                  paymentReserved = false;
                },
                finalize: async (response: Response) => {
                  if (response.status < 200 || response.status >= 300) {
                    paymentReserved = false;
                    return response;
                  }
                  if (failNextSettlement) {
                    failNextSettlement = false;
                    paymentReserved = false;
                    return Response.json(
                      {
                        error: {
                          code: 'settlement_failed',
                          message: 'Settlement was declined',
                        },
                      },
                      {
                        status: 402,
                        headers: { 'X-Payment-Response': 'declined' },
                      }
                    );
                  }
                  paymentReserved = false;
                  const settled = new Response(response.body, response);
                  settled.headers.set('X-Payment-Response', 'settled');
                  return settled;
                },
              };
            },
          };
        },
      } as unknown as PaymentsRuntime;

      const request = () =>
        new Request('http://localhost/tasks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Task-Access-Token': TASK_ACCESS_TOKEN,
          },
          body: JSON.stringify({
            skillId: 'settlement-task',
            message: { role: 'user', content: { text: '{}' } },
          }),
        });

      const failed = await rawHandlers.tasks(request());
      expect(failed.status).toBe(402);
      expect(failed.headers.get('X-Payment-Response')).toBe('declined');

      const failedList = await rawHandlers.listTasks(
        new Request('http://localhost/tasks', {
          headers: { 'Task-Access-Token': TASK_ACCESS_TOKEN },
        })
      );
      const [failedTask] = ((await failedList.json()) as { tasks: Task[] })
        .tasks;
      const failedTaskResponse = await rawHandlers.getTask(
        new Request(`http://localhost/tasks/${failedTask?.taskId}`, {
          headers: { 'Task-Access-Token': TASK_ACCESS_TOKEN },
        }),
        { taskId: failedTask?.taskId ?? '' }
      );
      expect(failedTaskResponse.status).toBe(200);
      expect(((await failedTaskResponse.json()) as Task).status).toBe(
        'cancelled'
      );

      const retried = await rawHandlers.tasks(request());
      expect(retried.status).toBe(200);
      expect(retried.headers.get('X-Payment-Response')).toBe('settled');

      await runtime.a2a.tasks.close();
    });

    it('cancels gated work and aborts authorization when settlement throws', async () => {
      const { rawHandlers, runtime, entrypoints } = makeTestHandlers();
      let executions = 0;
      entrypoints.set('throwing-settlement-task', {
        key: 'throwing-settlement-task',
        price: '1',
        handler: async () => {
          executions += 1;
          return { output: { ok: true } };
        },
      });

      let failNextSettlement = true;
      let paymentReserved = false;
      (
        runtime as AgentRuntime<{
          a2a: A2ARuntime;
          payments: PaymentsRuntime;
        }>
      ).payments = {
        requirements: () => ({ required: false }),
        authorize: async () => ({
          authorized: true,
          admit: async () => {
            paymentReserved = true;
            return {
              admitted: true,
              abort: async () => {
                paymentReserved = false;
              },
              isCommitted: () => false,
              finalize: async (response: Response) => {
                if (failNextSettlement) {
                  failNextSettlement = false;
                  throw new Error('settlement transport unavailable');
                }
                paymentReserved = false;
                return response;
              },
            };
          },
        }),
      } as unknown as PaymentsRuntime;

      const request = () =>
        new Request('http://localhost/tasks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Task-Access-Token': TASK_ACCESS_TOKEN,
          },
          body: JSON.stringify({
            skillId: 'throwing-settlement-task',
            message: { role: 'user', content: { text: '{}' } },
          }),
        });

      const failed = await rawHandlers.tasks(request());
      expect(failed.status).toBe(503);
      expect(await failed.json()).toEqual({
        error: {
          code: 'task_execution_failed',
          message: 'settlement transport unavailable',
        },
      });
      expect(paymentReserved).toBe(false);
      expect(executions).toBe(0);

      const [failedTask] = (
        (await (
          await rawHandlers.listTasks(
            new Request('http://localhost/tasks', {
              headers: { 'Task-Access-Token': TASK_ACCESS_TOKEN },
            })
          )
        ).json()) as { tasks: Task[] }
      ).tasks;
      expect(failedTask?.status).toBe('cancelled');

      const retried = await rawHandlers.tasks(request());
      expect(retried.status).toBe(200);

      await runtime.a2a.tasks.close();
    });

    it('finalizes authorization when task capacity reservation fails', async () => {
      const { rawHandlers, runtime, entrypoints } = makeTestHandlers();
      let releaseFirst!: () => void;
      const firstCanFinish = new Promise<void>(resolve => {
        releaseFirst = resolve;
      });
      entrypoints.set('occupy-capacity', {
        key: 'occupy-capacity',
        handler: async () => {
          await firstCanFinish;
          return { output: { ok: true } };
        },
      });
      runtime.a2a.tasks = createTaskRuntime({
        store: createDurableTestTaskStore({ maxTasks: 1 }),
      });
      const finalizedStatuses: number[] = [];
      (
        runtime as AgentRuntime<{
          a2a: A2ARuntime;
          payments: PaymentsRuntime;
        }>
      ).payments = {
        requirements: () => ({ required: false }),
        authorize: async () => ({
          authorized: true,
          admit: async () => ({
            admitted: true,
            abort: async () => {},
            finalize: async (response: Response) => {
              finalizedStatuses.push(response.status);
              return response;
            },
          }),
        }),
      } as unknown as PaymentsRuntime;
      const request = () =>
        new Request('http://localhost/tasks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Task-Access-Token': TASK_ACCESS_TOKEN,
          },
          body: JSON.stringify({
            skillId: 'occupy-capacity',
            message: { role: 'user', content: { text: '{}' } },
          }),
        });

      const admitted = await rawHandlers.tasks(request());
      const rejected = await rawHandlers.tasks(request());

      expect(admitted.status).toBe(200);
      expect(rejected.status).toBe(503);
      expect(finalizedStatuses).toEqual([200, 503]);
      releaseFirst();
      await runtime.a2a.tasks.close();
    });

    it('creates a task and returns taskId with running status', async () => {
      const { handlers, entrypoints } = makeTestHandlers();
      entrypoints.set('echo', {
        key: 'echo',
        description: 'Echo endpoint',
        input: z.object({ text: z.string() }),
        output: z.object({ text: z.string() }),
        handler: async ctx => {
          const input = ctx.input as { text: string };
          return {
            output: { text: input.text },
            usage: { total_tokens: 0 },
          };
        },
      });

      const requestBody: SendMessageRequest = {
        message: {
          role: 'user',
          content: { text: JSON.stringify({ text: 'hello' }) },
        },
        skillId: 'echo',
      };

      const request = new Request('http://localhost/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const response = await handlers.tasks(request);
      expect(response.status).toBe(200);

      const data = (await response.json()) as {
        taskId: string;
        status: TaskStatus;
      };
      expect(data.taskId).toBeDefined();
      expect(typeof data.taskId).toBe('string');
      expect(data.status).toBe('running');
    });

    it('fires async execution and returns immediately', async () => {
      const { handlers, entrypoints } = makeTestHandlers();
      let handlerCalled = false;

      entrypoints.set('slow', {
        key: 'slow',
        description: 'Slow endpoint',
        input: z.object({ text: z.string() }),
        output: z.object({ text: z.string() }),
        handler: async ctx => {
          const input = ctx.input as { text: string };
          await new Promise(resolve => setTimeout(resolve, 100));
          handlerCalled = true;
          return {
            output: { text: input.text },
            usage: { total_tokens: 0 },
          };
        },
      });

      const requestBody: SendMessageRequest = {
        message: {
          role: 'user',
          content: { text: JSON.stringify({ text: 'test' }) },
        },
        skillId: 'slow',
      };

      const request = new Request('http://localhost/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const startTime = Date.now();
      const response = await handlers.tasks(request);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(50);
      expect(response.status).toBe(200);

      const data = (await response.json()) as {
        taskId: string;
        status: TaskStatus;
      };
      expect(data.status).toBe('running');

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(handlerCalled).toBe(true);
    });

    it('returns 404 if skillId not found', async () => {
      const { handlers } = makeTestHandlers();

      const requestBody: SendMessageRequest = {
        message: {
          role: 'user',
          content: { text: JSON.stringify({ text: 'hello' }) },
        },
        skillId: 'nonexistent',
      };

      const request = new Request('http://localhost/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const response = await handlers.tasks(request);
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect((data as { error: { code: string } }).error.code).toBe(
        'skill_not_found'
      );
    });

    it('returns 400 if request body is invalid', async () => {
      const { handlers } = makeTestHandlers();

      const request = new Request('http://localhost/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: 'data' }),
      });

      const response = await handlers.tasks(request);
      expect(response.status).toBe(400);
    });

    it('returns 400 for malformed message objects instead of throwing', async () => {
      const { handlers } = makeTestHandlers();
      const request = new Request('http://localhost/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId: 'echo', message: null }),
      });

      const response = await handlers.tasks(request);

      expect(response.status).toBe(400);
      expect(
        (await response.json()) as {
          error: { code: string; message: string };
        }
      ).toEqual({
        error: { code: 'invalid_request', message: 'Invalid request body' },
      });
    });
  });

  describe('GET /tasks/{taskId} - Get Task Status', () => {
    it('returns task with running status immediately after creation', async () => {
      const { handlers, entrypoints } = makeTestHandlers();
      entrypoints.set('echo', {
        key: 'echo',
        description: 'Echo endpoint',
        input: z.object({ text: z.string() }),
        output: z.object({ text: z.string() }),
        handler: async ctx => {
          const input = ctx.input as { text: string };
          await new Promise(resolve => setTimeout(resolve, 50));
          return {
            output: { text: input.text },
            usage: { total_tokens: 0 },
          };
        },
      });

      // Create task
      const requestBody: SendMessageRequest = {
        message: {
          role: 'user',
          content: { text: JSON.stringify({ text: 'hello' }) },
        },
        skillId: 'echo',
      };

      const createRequest = new Request('http://localhost/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const createResponse = await handlers.tasks(createRequest);
      const { taskId } = (await createResponse.json()) as { taskId: string };

      // Get task status immediately (should be running)
      const getRequest = new Request(`http://localhost/tasks/${taskId}`, {
        method: 'GET',
      });

      const getResponse = await handlers.getTask(getRequest, {
        taskId,
      });
      expect(getResponse.status).toBe(200);

      const task = (await getResponse.json()) as Task;
      expect(task.taskId).toBe(taskId);
      expect(task.status).toBe('running');
      expect(task.result).toBeUndefined();
      expect(task.error).toBeUndefined();
      expect(task.createdAt).toBeDefined();
      expect(task.updatedAt).toBeDefined();
    });

    it('returns task with completed status after handler finishes', async () => {
      const { handlers, entrypoints } = makeTestHandlers();
      entrypoints.set('echo', {
        key: 'echo',
        description: 'Echo endpoint',
        input: z.object({ text: z.string() }),
        output: z.object({ text: z.string() }),
        handler: async ctx => {
          const input = ctx.input as { text: string };
          return {
            output: { text: input.text },
            usage: { total_tokens: 10 },
            model: 'test-model',
          };
        },
      });

      // Create task
      const requestBody: SendMessageRequest = {
        message: {
          role: 'user',
          content: { text: JSON.stringify({ text: 'hello' }) },
        },
        skillId: 'echo',
      };

      const createRequest = new Request('http://localhost/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const createResponse = await handlers.tasks(createRequest);
      const { taskId } = (await createResponse.json()) as { taskId: string };

      // Wait for task to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get task status (should be completed)
      const getRequest = new Request(`http://localhost/tasks/${taskId}`, {
        method: 'GET',
      });

      const getResponse = await handlers.getTask(getRequest, {
        taskId,
      });
      expect(getResponse.status).toBe(200);

      const task = (await getResponse.json()) as Task;
      expect(task.status).toBe('completed');
      expect(task.result).toBeDefined();
      expect(task.result?.output).toEqual({ text: 'hello' });
      expect(task.result?.usage).toEqual({ total_tokens: 10 });
      expect(task.result?.model).toBe('test-model');
    });

    it('returns task with failed status if handler throws error', async () => {
      const { handlers, entrypoints } = makeTestHandlers();
      entrypoints.set('failing', {
        key: 'failing',
        description: 'Failing endpoint',
        input: z.object({ text: z.string() }),
        output: z.object({ text: z.string() }),
        handler: async () => {
          throw new Error('Handler failed');
        },
      });

      // Create task
      const requestBody: SendMessageRequest = {
        message: {
          role: 'user',
          content: { text: JSON.stringify({ text: 'hello' }) },
        },
        skillId: 'failing',
      };

      const createRequest = new Request('http://localhost/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const createResponse = await handlers.tasks(createRequest);
      const { taskId } = (await createResponse.json()) as { taskId: string };

      // Wait for task to fail
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get task status (should be failed)
      const getRequest = new Request(`http://localhost/tasks/${taskId}`, {
        method: 'GET',
      });

      const getResponse = await handlers.getTask(getRequest, {
        taskId,
      });
      expect(getResponse.status).toBe(200);

      const task = (await getResponse.json()) as Task;
      expect(task.status).toBe('failed');
      expect(task.error).toBeDefined();
      expect(task.error?.code).toBe('internal_error');
      expect(task.error?.message).toBe('Handler failed');
    });

    it('returns 404 if taskId not found', async () => {
      const { handlers } = makeTestHandlers();
      const fakeTaskId = randomUUID();

      const request = new Request(`http://localhost/tasks/${fakeTaskId}`, {
        method: 'GET',
      });

      const response = await handlers.getTask(request, {
        taskId: fakeTaskId,
      });
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect((data as { error: { code: string } }).error.code).toBe(
        'task_not_found'
      );
    });
  });

  describe('GET /tasks/{taskId}/subscribe - Task Subscription (SSE)', () => {
    it('streams status updates for task', async () => {
      const { handlers, entrypoints } = makeTestHandlers();
      entrypoints.set('echo', {
        key: 'echo',
        description: 'Echo endpoint',
        input: z.object({ text: z.string() }),
        output: z.object({ text: z.string() }),
        handler: async ctx => {
          const input = ctx.input as { text: string };
          await new Promise(resolve => setTimeout(resolve, 50));
          return {
            output: { text: input.text },
            usage: { total_tokens: 0 },
          };
        },
      });

      // Create task
      const requestBody: SendMessageRequest = {
        message: {
          role: 'user',
          content: { text: JSON.stringify({ text: 'hello' }) },
        },
        skillId: 'echo',
      };

      const createRequest = new Request('http://localhost/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const createResponse = await handlers.tasks(createRequest);
      const { taskId } = (await createResponse.json()) as { taskId: string };

      // Subscribe to task updates
      const subscribeRequest = new Request(
        `http://localhost/tasks/${taskId}/subscribe`,
        {
          method: 'GET',
        }
      );

      const subscribeResponse = await handlers.subscribeTask(subscribeRequest, {
        taskId,
      });
      expect(subscribeResponse.status).toBe(200);
      expect(subscribeResponse.headers.get('Content-Type')).toContain(
        'text/event-stream'
      );

      // Read SSE stream
      const reader = subscribeResponse.body?.getReader();
      const decoder = new TextDecoder();
      const events: Array<{ type: string; data: unknown }> = [];

      if (!reader) {
        throw new Error('Response body is null');
      }

      try {
        let buffer = '';
        let done = false;
        while (!done) {
          const result = await reader.read();
          done = result.done;
          if (done) break;
          const { value } = result;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              const eventType = line.slice(7).trim();
              // Look for next data line
              const dataLine = lines[lines.indexOf(line) + 1];
              if (dataLine?.startsWith('data: ')) {
                try {
                  const data = JSON.parse(dataLine.slice(6));
                  events.push({ type: eventType, data });
                } catch {
                  // Skip invalid JSON
                }
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Wait for task to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify we got events
      expect(events.length).toBeGreaterThan(0);
      const statusUpdate = events.find(e => e.type === 'statusUpdate');
      expect(statusUpdate).toBeDefined();
    });
  });

  describe('Task Lifecycle', () => {
    it('handles concurrent task execution', async () => {
      const { handlers, entrypoints } = makeTestHandlers();
      entrypoints.set('echo', {
        key: 'echo',
        description: 'Echo endpoint',
        input: z.object({ text: z.string() }),
        output: z.object({ text: z.string() }),
        handler: async ctx => {
          const input = ctx.input as { text: string };
          return {
            output: { text: input.text },
            usage: { total_tokens: 0 },
          };
        },
      });

      // Create multiple tasks concurrently
      const taskPromises = Array.from({ length: 5 }, (_, i) => {
        const requestBody: SendMessageRequest = {
          message: {
            role: 'user',
            content: { text: JSON.stringify({ text: `hello-${i}` }) },
          },
          skillId: 'echo',
        };

        const request = new Request('http://localhost/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        return handlers.tasks(request);
      });

      const responses = await Promise.all(taskPromises);
      const taskIds = await Promise.all(
        responses.map(async r => {
          const data = (await r.json()) as { taskId: string };
          return data.taskId;
        })
      );

      // Verify all tasks have unique IDs
      expect(new Set(taskIds).size).toBe(5);

      // Wait for all tasks to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify all tasks completed
      for (const taskId of taskIds) {
        const getRequest = new Request(`http://localhost/tasks/${taskId}`, {
          method: 'GET',
        });

        const getResponse = await handlers.getTask(getRequest, {
          taskId,
        });
        const task = (await getResponse.json()) as Task;
        expect(task.status).toBe('completed');
      }
    });
  });

  describe('GET /tasks - List Tasks', () => {
    it('returns all tasks without filters', async () => {
      const { handlers, entrypoints } = makeTestHandlers();
      entrypoints.set('echo', {
        key: 'echo',
        description: 'Echo endpoint',
        input: z.object({ text: z.string() }),
        output: z.object({ text: z.string() }),
        handler: async ctx => {
          const input = ctx.input as { text: string };
          return {
            output: { text: input.text },
            usage: { total_tokens: 0 },
          };
        },
      });

      const createTask = async (text: string) => {
        const requestBody: SendMessageRequest = {
          message: {
            role: 'user',
            content: { text: JSON.stringify({ text }) },
          },
          skillId: 'echo',
        };

        const request = new Request('http://localhost/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        const response = await handlers.tasks(request);
        const data = (await response.json()) as { taskId: string };
        return data.taskId;
      };

      const taskId1 = await createTask('hello1');
      const taskId2 = await createTask('hello2');

      await new Promise(resolve => setTimeout(resolve, 100));

      const listRequest = new Request('http://localhost/tasks', {
        method: 'GET',
      });

      const listResponse = await handlers.listTasks(listRequest);
      expect(listResponse.status).toBe(200);

      const listData = (await listResponse.json()) as {
        tasks: Task[];
        total?: number;
        hasMore?: boolean;
      };
      expect(listData.tasks.length).toBeGreaterThanOrEqual(2);
      expect(listData.tasks.some(t => t.taskId === taskId1)).toBe(true);
      expect(listData.tasks.some(t => t.taskId === taskId2)).toBe(true);
    });

    it('filters tasks by contextId', async () => {
      const { handlers, entrypoints } = makeTestHandlers();
      entrypoints.set('echo', {
        key: 'echo',
        description: 'Echo endpoint',
        input: z.object({ text: z.string() }),
        output: z.object({ text: z.string() }),
        handler: async ctx => {
          const input = ctx.input as { text: string };
          return {
            output: { text: input.text },
            usage: { total_tokens: 0 },
          };
        },
      });

      const createTask = async (text: string, contextId?: string) => {
        const requestBody: SendMessageRequest = {
          message: {
            role: 'user',
            content: { text: JSON.stringify({ text }) },
          },
          skillId: 'echo',
          contextId,
        };

        const request = new Request('http://localhost/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        const response = await handlers.tasks(request);
        const data = (await response.json()) as { taskId: string };
        return data.taskId;
      };

      const contextId1 = 'context-1';
      const contextId2 = 'context-2';

      const taskId1 = await createTask('hello1', contextId1);
      const taskId2 = await createTask('hello2', contextId1);
      const taskId3 = await createTask('hello3', contextId2);

      await new Promise(resolve => setTimeout(resolve, 100));

      const listRequest = new Request(
        `http://localhost/tasks?contextId=${contextId1}`,
        {
          method: 'GET',
        }
      );

      const listResponse = await handlers.listTasks(listRequest);
      expect(listResponse.status).toBe(200);

      const listData = (await listResponse.json()) as {
        tasks: Task[];
        total?: number;
        hasMore?: boolean;
      };
      expect(listData.tasks.length).toBe(2);
      expect(listData.tasks.every(t => t.contextId === contextId1)).toBe(true);
      expect(listData.tasks.some(t => t.taskId === taskId1)).toBe(true);
      expect(listData.tasks.some(t => t.taskId === taskId2)).toBe(true);
      expect(listData.tasks.some(t => t.taskId === taskId3)).toBe(false);
    });

    it('filters tasks by status', async () => {
      const { handlers, entrypoints } = makeTestHandlers();
      entrypoints.set('echo', {
        key: 'echo',
        description: 'Echo endpoint',
        input: z.object({ text: z.string() }),
        output: z.object({ text: z.string() }),
        handler: async ctx => {
          const input = ctx.input as { text: string };
          return {
            output: { text: input.text },
            usage: { total_tokens: 0 },
          };
        },
      });

      const createTask = async (text: string) => {
        const requestBody: SendMessageRequest = {
          message: {
            role: 'user',
            content: { text: JSON.stringify({ text }) },
          },
          skillId: 'echo',
        };

        const request = new Request('http://localhost/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        const response = await handlers.tasks(request);
        const data = (await response.json()) as { taskId: string };
        return data.taskId;
      };

      await createTask('hello1');
      await createTask('hello2');

      await new Promise(resolve => setTimeout(resolve, 100));

      const listRequest = new Request(
        'http://localhost/tasks?status=completed',
        {
          method: 'GET',
        }
      );

      const listResponse = await handlers.listTasks(listRequest);
      expect(listResponse.status).toBe(200);

      const listData = (await listResponse.json()) as {
        tasks: Task[];
        total?: number;
        hasMore?: boolean;
      };
      expect(listData.tasks.length).toBeGreaterThanOrEqual(2);
      expect(listData.tasks.every(t => t.status === 'completed')).toBe(true);
    });

    it('supports pagination with limit and offset', async () => {
      const { handlers, entrypoints } = makeTestHandlers();
      entrypoints.set('echo', {
        key: 'echo',
        description: 'Echo endpoint',
        input: z.object({ text: z.string() }),
        output: z.object({ text: z.string() }),
        handler: async ctx => {
          const input = ctx.input as { text: string };
          return {
            output: { text: input.text },
            usage: { total_tokens: 0 },
          };
        },
      });

      const createTask = async (text: string) => {
        const requestBody: SendMessageRequest = {
          message: {
            role: 'user',
            content: { text: JSON.stringify({ text }) },
          },
          skillId: 'echo',
        };

        const request = new Request('http://localhost/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        const response = await handlers.tasks(request);
        const data = (await response.json()) as { taskId: string };
        return data.taskId;
      };

      await createTask('hello1');
      await createTask('hello2');
      await createTask('hello3');

      await new Promise(resolve => setTimeout(resolve, 100));

      const listRequest = new Request(
        'http://localhost/tasks?limit=2&offset=0',
        {
          method: 'GET',
        }
      );

      const listResponse = await handlers.listTasks(listRequest);
      expect(listResponse.status).toBe(200);

      const listData = (await listResponse.json()) as {
        tasks: Task[];
        total?: number;
        hasMore?: boolean;
      };
      expect(listData.tasks.length).toBe(2);
      expect(listData.total).toBeGreaterThanOrEqual(3);
      expect(listData.hasMore).toBe(true);
    });
  });

  describe('POST /tasks/{taskId}/cancel - Cancel Task', () => {
    it('cancels a running task', async () => {
      const { handlers, entrypoints } = makeTestHandlers();

      entrypoints.set('slow', {
        key: 'slow',
        description: 'Slow endpoint',
        input: z.object({ delay: z.number() }),
        output: z.object({ done: z.boolean() }),
        handler: async ctx => {
          const input = ctx.input as { delay: number };
          if (ctx.signal?.aborted) {
            throw new Error('Task aborted');
          }
          await new Promise(resolve => setTimeout(resolve, input.delay));
          if (ctx.signal?.aborted) {
            throw new Error('Task aborted');
          }
          return {
            output: { done: true },
            usage: { total_tokens: 0 },
          };
        },
      });

      const requestBody: SendMessageRequest = {
        message: {
          role: 'user',
          content: { text: JSON.stringify({ delay: 1000 }) },
        },
        skillId: 'slow',
      };

      const createRequest = new Request('http://localhost/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const createResponse = await handlers.tasks(createRequest);
      const { taskId } = (await createResponse.json()) as { taskId: string };

      await new Promise(resolve => setTimeout(resolve, 50));

      const cancelRequest = new Request(
        `http://localhost/tasks/${taskId}/cancel`,
        {
          method: 'POST',
        }
      );

      const cancelResponse = await handlers.cancelTask(cancelRequest, {
        taskId,
      });
      expect(cancelResponse.status).toBe(200);

      const cancelledTask = (await cancelResponse.json()) as Task;
      expect(cancelledTask.status).toBe('cancelled');
      expect(cancelledTask.taskId).toBe(taskId);

      await new Promise(resolve => setTimeout(resolve, 100));

      const getRequest = new Request(`http://localhost/tasks/${taskId}`, {
        method: 'GET',
      });

      const getResponse = await handlers.getTask(getRequest, {
        taskId,
      });
      const task = (await getResponse.json()) as Task;
      expect(task.status).toBe('cancelled');
    });

    it('returns 404 for non-existent task', async () => {
      const { handlers } = makeTestHandlers();

      const cancelRequest = new Request(
        'http://localhost/tasks/non-existent/cancel',
        {
          method: 'POST',
        }
      );

      const cancelResponse = await handlers.cancelTask(cancelRequest, {
        taskId: 'non-existent',
      });
      expect(cancelResponse.status).toBe(404);

      const error = (await cancelResponse.json()) as {
        error: { code: string; message: string };
      };
      expect(error.error.code).toBe('task_not_found');
    });

    it('returns 400 for non-running task', async () => {
      const { handlers, entrypoints } = makeTestHandlers();
      entrypoints.set('echo', {
        key: 'echo',
        description: 'Echo endpoint',
        input: z.object({ text: z.string() }),
        output: z.object({ text: z.string() }),
        handler: async ctx => {
          const input = ctx.input as { text: string };
          return {
            output: { text: input.text },
            usage: { total_tokens: 0 },
          };
        },
      });

      const requestBody: SendMessageRequest = {
        message: {
          role: 'user',
          content: { text: JSON.stringify({ text: 'hello' }) },
        },
        skillId: 'echo',
      };

      const createRequest = new Request('http://localhost/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const createResponse = await handlers.tasks(createRequest);
      const { taskId } = (await createResponse.json()) as { taskId: string };

      await new Promise(resolve => setTimeout(resolve, 100));

      const cancelRequest = new Request(
        `http://localhost/tasks/${taskId}/cancel`,
        {
          method: 'POST',
        }
      );

      const cancelResponse = await handlers.cancelTask(cancelRequest, {
        taskId,
      });
      expect(cancelResponse.status).toBe(400);

      const error = (await cancelResponse.json()) as {
        error: { code: string; message: string };
      };
      expect(error.error.code).toBe('invalid_state');
    });
  });
});
