import type {
  A2ATaskRuntime,
  ExecuteTaskOptions,
  PreparedTaskExecution,
  Task,
} from '@lucid-agents/types/a2a';
import { createInMemoryTaskStore, createTaskRuntime } from '@lucid-agents/a2a';
import { describe, expect, it } from 'bun:test';

import type { AdmittedEntrypointAdmission } from '../authorization';
import { admitTaskExecution, rejectReservedTask } from '../task-admission';

const accessToken = 'test-access-token-0001';

function task(status: Task['status']): Task {
  return {
    taskId: 'task-1',
    status,
    createdAt: '2026-07-23T00:00:00.000Z',
    updatedAt: '2026-07-23T00:00:00.000Z',
  };
}

function runtime(overrides: Partial<A2ATaskRuntime> = {}): A2ATaskRuntime {
  return {
    durability: 'durable',
    reserve: async () => task('running'),
    prepare: async () => {
      throw new Error('prepare was not expected');
    },
    execute: async () => task('running'),
    start: async () => task('running'),
    get: async () => task('cancelled'),
    list: async () => ({ tasks: [] }),
    cancel: async () => task('cancelled'),
    subscribe: async () => () => {},
    close: async () => {},
    ...overrides,
  };
}

function prepared(runtime: A2ATaskRuntime): PreparedTaskExecution {
  return {
    task: task('running'),
    renew: async () => {},
    activate: options => runtime.execute('task-1', options),
    release: () => {},
  };
}

function capability(): Response {
  return Response.json({
    taskId: 'task-1',
    accessToken,
    status: 'running',
  });
}

function admission(
  overrides: Partial<AdmittedEntrypointAdmission> = {}
): AdmittedEntrypointAdmission {
  return {
    admitted: true,
    abort: async () => {},
    recoverCommittedResponse: response => response,
    finalize: async response => response,
    ...overrides,
  };
}

describe('task execution admission edge cases', () => {
  it('starts the execution timeout only after delayed settlement completes', async () => {
    const taskRuntime = createTaskRuntime({
      store: createInMemoryTaskStore({ maxTasks: 1 }),
      maxRunMs: 10,
    });
    await taskRuntime.reserve({
      taskId: 'task-1',
      accessToken,
      admissionTtlMs: 1_000,
    });
    const executionClaim = await taskRuntime.prepare('task-1');
    let handlerCalls = 0;
    let committed = false;

    const result = await admitTaskExecution({
      runtime: taskRuntime,
      task: { taskId: 'task-1', accessToken },
      capabilityResponse: capability(),
      executionClaim,
      authorization: admission({
        isCommitted: () => committed,
        finalize: async response => {
          await Bun.sleep(30);
          committed = true;
          response.headers.set('Payment-Receipt', 'delayed-settlement');
          return response;
        },
      }),
      execution: {
        execute: async () => {
          handlerCalls += 1;
          return { output: 'completed' };
        },
      },
      executionErrorResponse: error =>
        Response.json(
          { error: error instanceof Error ? error.message : 'failed' },
          { status: 503 }
        ),
    });

    await Bun.sleep(1);
    expect(result.response.status).toBe(200);
    expect(result.response.headers.get('Payment-Receipt')).toBe(
      'delayed-settlement'
    );
    expect(handlerCalls).toBe(1);
    expect((await taskRuntime.get('task-1', accessToken))?.status).toBe(
      'completed'
    );
    await taskRuntime.close();
  });

  it('preserves a terminal capability when finalization throws after a failed execution claim committed', async () => {
    let committed = false;
    const taskRuntime = runtime({
      execute: async () => {
        throw new Error('execution claim failed');
      },
    });
    const result = await admitTaskExecution({
      runtime: taskRuntime,
      task: { taskId: 'task-1', accessToken },
      capabilityResponse: capability(),
      executionClaim: prepared(taskRuntime),
      authorization: admission({
        isCommitted: () => committed,
        finalize: async () => {
          committed = true;
          throw new Error('settlement accounting failed');
        },
        recoverCommittedResponse: response => {
          response.headers.set('Payment-Receipt', 'receipt-after-commit');
          return response;
        },
      }),
      execution: {
        execute: async () => ({ output: 'unused' }),
      },
      executionErrorResponse: error =>
        Response.json(
          {
            error: error instanceof Error ? error.message : 'execution failed',
          },
          { status: 503 }
        ),
    });

    expect(result.accepted).toBe(true);
    expect(result.response.headers.get('Payment-Receipt')).toBe(
      'receipt-after-commit'
    );
    expect(await result.response.json()).toEqual({
      taskId: 'task-1',
      accessToken,
      status: 'cancelled',
    });
  });

  it('preserves a committed MPP receipt when the prepared claim cannot renew', async () => {
    let released = false;
    const taskRuntime = runtime();
    const result = await admitTaskExecution({
      runtime: taskRuntime,
      task: { taskId: 'task-1', accessToken },
      capabilityResponse: capability(),
      executionClaim: {
        task: task('running'),
        renew: async () => {
          throw new Error('prepared claim expired');
        },
        activate: async () => {
          throw new Error('activate must not run');
        },
        release: () => {
          released = true;
        },
      },
      authorization: admission({
        isCommitted: () => true,
        recoverCommittedResponse: response => {
          response.headers.set('Payment-Receipt', 'mpp-receipt');
          return response;
        },
        finalize: async () => {
          throw new Error('finalize must not run');
        },
      }),
      execution: {
        execute: async () => ({ output: 'unused' }),
      },
      executionErrorResponse: () =>
        Response.json({ error: 'execution failed' }, { status: 503 }),
    });

    expect(released).toBe(true);
    expect(result.accepted).toBe(true);
    expect(result.response.headers.get('Payment-Receipt')).toBe('mpp-receipt');
    expect(await result.response.json()).toEqual({
      taskId: 'task-1',
      accessToken,
      status: 'cancelled',
    });
  });

  it('releases gated execution when finalization throws after committing', async () => {
    let committed = false;
    let scheduled: ExecuteTaskOptions | undefined;
    const taskRuntime = runtime({
      execute: async (_taskId, options) => {
        scheduled = options;
        return task('running');
      },
    });
    const result = await admitTaskExecution({
      runtime: taskRuntime,
      task: { taskId: 'task-1', accessToken },
      capabilityResponse: capability(),
      executionClaim: prepared(taskRuntime),
      authorization: admission({
        isCommitted: () => committed,
        finalize: async () => {
          committed = true;
          throw new Error('post-settlement failure');
        },
        recoverCommittedResponse: response => {
          response.headers.set('X-Payment-Response', 'settled');
          return response;
        },
      }),
      execution: {
        execute: async () => ({ output: 'completed' }),
      },
      executionErrorResponse: () =>
        Response.json({ error: 'execution failed' }, { status: 503 }),
    });

    expect(result.accepted).toBe(true);
    expect(result.response.headers.get('X-Payment-Response')).toBe('settled');
    expect(scheduled).toBeDefined();
    expect(await result.response.json()).toEqual({
      taskId: 'task-1',
      accessToken,
      status: 'running',
    });
  });

  it('falls back to the stored terminal state when cancellation races', async () => {
    const response = await rejectReservedTask({
      runtime: runtime({
        cancel: async () => task('running'),
        get: async () => task('failed'),
      }),
      task: { taskId: 'task-1', accessToken },
      response: new Response(null, {
        status: 503,
        headers: { 'Payment-Receipt': 'receipt-1' },
      }),
      committed: true,
    });

    expect(response.headers.get('Payment-Receipt')).toBe('receipt-1');
    expect(await response.json()).toEqual({
      taskId: 'task-1',
      accessToken,
      status: 'failed',
    });
  });

  it('never fabricates a terminal status when cancellation cannot be confirmed', async () => {
    const response = await rejectReservedTask({
      runtime: runtime({
        cancel: async () => {
          throw new Error('store unavailable');
        },
        get: async () => {
          throw new Error('store unavailable');
        },
      }),
      task: { taskId: 'task-1', accessToken },
      response: new Response(null, {
        status: 503,
        headers: { 'Payment-Receipt': 'receipt-unknown-state' },
      }),
      committed: true,
    });

    expect(response.status).toBe(503);
    expect(response.headers.get('Payment-Receipt')).toBe(
      'receipt-unknown-state'
    );
    expect(await response.json()).toEqual({
      error: {
        code: 'task_terminalization_failed',
        message:
          'Payment committed, but the terminal task state could not be confirmed. Retain this capability and query the task again.',
      },
      taskId: 'task-1',
      accessToken,
    });
  });

  it('preserves only payment receipts on the JSON task capability', async () => {
    const response = await rejectReservedTask({
      runtime: runtime(),
      task: { taskId: 'task-1', accessToken },
      response: new Response(null, {
        status: 302,
        headers: {
          'Content-Type': 'text/html',
          Location: 'https://untrusted.example.com',
          'Set-Cookie': 'session=unexpected',
          'Payment-Receipt': 'receipt-safe',
        },
      }),
      committed: true,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(response.headers.get('Location')).toBeNull();
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(response.headers.get('Payment-Receipt')).toBe('receipt-safe');
  });
});
