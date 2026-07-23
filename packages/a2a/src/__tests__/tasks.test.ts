import { describe, expect, it } from 'bun:test';

import type { TaskStore, TaskUpdateEvent } from '@lucid-agents/types/a2a';

import {
  TaskCapacityError,
  createInMemoryTaskStore,
  createTaskRuntime,
} from '../tasks';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const ACCESS_TOKEN = 'test-task-access-token-0001';
const OTHER_TOKEN = 'test-task-access-token-0002';

describe('A2A task state machine', () => {
  it('executes and publishes state changes without polling', async () => {
    const store = createInMemoryTaskStore({ maxTasks: 10 });
    const runtime = createTaskRuntime({ store });
    const events: TaskUpdateEvent[] = [];
    await runtime.reserve({
      taskId: 'task-1',
      contextId: 'context-1',
      accessToken: ACCESS_TOKEN,
    });
    const unsubscribe = await runtime.subscribe(
      'task-1',
      ACCESS_TOKEN,
      event => {
        events.push(event);
      }
    );

    await runtime.execute('task-1', {
      execute: async () => ({ output: { ok: true } }),
    });
    await tick();

    expect((await runtime.get('task-1', ACCESS_TOKEN))?.status).toBe(
      'completed'
    );
    expect(events.map(event => event.type)).toEqual(['resultUpdate']);
    expect(events[events.length - 1]?.data.result?.output).toEqual({
      ok: true,
    });
    unsubscribe();
  });

  it('uses compare-and-set transitions so cancellation wins completion races', async () => {
    const runtime = createTaskRuntime({
      store: createInMemoryTaskStore({ maxTasks: 10 }),
    });
    let release!: () => void;
    const blocked = new Promise<void>(resolve => {
      release = resolve;
    });

    await runtime.start({
      taskId: 'task-1',
      accessToken: ACCESS_TOKEN,
      execute: async () => {
        await blocked;
        return { output: { late: true } };
      },
    });
    const cancelled = await runtime.cancel('task-1', ACCESS_TOKEN);
    release();
    await tick();

    expect(cancelled?.status).toBe('cancelled');
    expect((await runtime.get('task-1', ACCESS_TOKEN))?.status).toBe(
      'cancelled'
    );
  });

  it('bounds active state and evicts the oldest terminal task first', async () => {
    const store = createInMemoryTaskStore({ maxTasks: 2 });
    const runtime = createTaskRuntime({ store });

    await runtime.start({
      taskId: 'done-1',
      accessToken: ACCESS_TOKEN,
      execute: async () => ({ output: 1 }),
    });
    await tick();
    await runtime.start({
      taskId: 'running-1',
      accessToken: ACCESS_TOKEN,
      execute: async signal =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason));
        }),
    });
    await runtime.start({
      taskId: 'running-2',
      accessToken: ACCESS_TOKEN,
      execute: async signal =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason));
        }),
    });

    expect(await runtime.get('done-1', ACCESS_TOKEN)).toBeUndefined();
    await expect(
      runtime.start({
        taskId: 'running-3',
        accessToken: ACCESS_TOKEN,
        execute: async () => ({ output: 3 }),
      })
    ).rejects.toBeInstanceOf(TaskCapacityError);
    await runtime.close();
  });

  it('reaps an abandoned admission before enforcing capacity after restart', async () => {
    let now = 1_000;
    const base = createInMemoryTaskStore({
      maxTasks: 1,
      now: () => now,
    });
    const durableStore: TaskStore = {
      ...base,
      durability: 'durable',
      close() {
        // Simulate a durable store surviving the worker that reserved capacity.
      },
    };
    const first = createTaskRuntime({
      store: durableStore,
      now: () => now,
    });
    await first.reserve({
      taskId: 'abandoned-admission',
      accessToken: ACCESS_TOKEN,
      admissionTtlMs: 100,
    });
    await first.close();

    now += 101;
    const restarted = createTaskRuntime({
      store: durableStore,
      now: () => now,
    });
    await restarted.reserve({
      taskId: 'replacement-admission',
      accessToken: ACCESS_TOKEN,
      admissionTtlMs: 100,
    });

    expect(
      await restarted.get('abandoned-admission', ACCESS_TOKEN)
    ).toBeUndefined();
    expect(
      (await restarted.get('replacement-admission', ACCESS_TOKEN))?.status
    ).toBe('running');
    await restarted.close();
  });

  it('clears admission expiry when execution is claimed', async () => {
    let now = 1_000;
    const store = createInMemoryTaskStore({ maxTasks: 2, now: () => now });
    const runtime = createTaskRuntime({ store, now: () => now });
    await runtime.reserve({
      taskId: 'claimed-admission',
      accessToken: ACCESS_TOKEN,
      admissionTtlMs: 100,
    });
    let release!: () => void;
    const blocked = new Promise<void>(resolve => {
      release = resolve;
    });
    await runtime.execute('claimed-admission', {
      execute: async () => {
        await blocked;
        return { output: true };
      },
    });

    now += 101;
    await store.reapExpiredAdmissions(now);
    expect((await runtime.get('claimed-admission', ACCESS_TOKEN))?.status).toBe(
      'running'
    );
    release();
    await tick();
    await runtime.close();
  });

  it('never prepares an admission after its durable expiry', async () => {
    let now = 1_000;
    const store = createInMemoryTaskStore({ maxTasks: 1, now: () => now });
    const runtime = createTaskRuntime({ store, now: () => now });
    await runtime.reserve({
      taskId: 'expired-admission',
      accessToken: ACCESS_TOKEN,
      admissionTtlMs: 100,
    });

    now += 101;
    await expect(runtime.prepare('expired-admission')).rejects.toThrow(
      'is not running'
    );
    expect((await runtime.get('expired-admission', ACCESS_TOKEN))?.status).toBe(
      'cancelled'
    );
    await runtime.close();
  });

  it('heartbeats a prepared claim while authorization is in flight', async () => {
    const base = createInMemoryTaskStore({ maxTasks: 1 });
    const store: TaskStore = {
      ...base,
      durability: 'durable',
    };
    const runtime = createTaskRuntime({
      store,
      admissionLeaseMs: 15,
    });
    await runtime.reserve({
      taskId: 'slow-authorization',
      accessToken: ACCESS_TOKEN,
      admissionTtlMs: 5,
    });
    const prepared = await runtime.prepare('slow-authorization');

    await new Promise(resolve => setTimeout(resolve, 45));
    await expect(
      runtime.reserve({
        taskId: 'concurrent-capacity-probe',
        accessToken: ACCESS_TOKEN,
        admissionTtlMs: 5,
      })
    ).rejects.toBeInstanceOf(TaskCapacityError);

    await prepared.renew();
    await prepared.activate({
      execute: async () => ({ output: 'after-settlement' }),
    });
    await tick();
    expect(
      (await runtime.get('slow-authorization', ACCESS_TOKEN))?.result
    ).toEqual({ output: 'after-settlement' });
    await runtime.close();
  });

  it('expires terminal tasks after the retention window', async () => {
    let now = 1_000;
    const store = createInMemoryTaskStore({
      maxTasks: 10,
      retentionMs: 100,
      now: () => now,
    });
    const runtime = createTaskRuntime({ store, now: () => now });

    await runtime.start({
      taskId: 'task-1',
      accessToken: ACCESS_TOKEN,
      execute: async () => ({ output: true }),
    });
    await tick();
    now += 101;

    expect(await runtime.get('task-1', ACCESS_TOKEN)).toBeUndefined();
  });

  it('scopes reads, lists, cancellation, and subscriptions to the owner token', async () => {
    const runtime = createTaskRuntime({
      store: createInMemoryTaskStore({ maxTasks: 10 }),
    });
    await runtime.start({
      taskId: 'owned-task',
      accessToken: ACCESS_TOKEN,
      execute: async signal =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason));
        }),
    });

    expect(await runtime.get('owned-task', OTHER_TOKEN)).toBeUndefined();
    expect((await runtime.list(OTHER_TOKEN)).tasks).toEqual([]);
    expect(await runtime.cancel('owned-task', OTHER_TOKEN)).toBeUndefined();
    expect((await runtime.get('owned-task', ACCESS_TOKEN))?.status).toBe(
      'running'
    );
    expect((await runtime.list(ACCESS_TOKEN)).tasks).toHaveLength(1);

    const events: TaskUpdateEvent[] = [];
    await runtime.subscribe('owned-task', OTHER_TOKEN, event => {
      events.push(event);
    });
    await runtime.cancel('owned-task', ACCESS_TOKEN);
    await tick();
    expect(events).toEqual([]);
    await runtime.close();
  });

  it('atomically claims execution across runtimes sharing one store', async () => {
    const store = createInMemoryTaskStore({ maxTasks: 10 });
    const first = createTaskRuntime({ store });
    const second = createTaskRuntime({ store });
    let executions = 0;
    let release!: () => void;
    const blocked = new Promise<void>(resolve => {
      release = resolve;
    });
    await first.reserve({
      taskId: 'shared-task',
      accessToken: ACCESS_TOKEN,
    });

    await first.execute('shared-task', {
      execute: async () => {
        executions += 1;
        await blocked;
        return { output: 'first' };
      },
    });
    await expect(
      second.execute('shared-task', {
        execute: async () => {
          executions += 1;
          return { output: 'second' };
        },
      })
    ).rejects.toThrow('already executing');

    expect(executions).toBe(1);
    release();
    await tick();
    expect((await first.get('shared-task', ACCESS_TOKEN))?.status).toBe(
      'completed'
    );
  });

  it('recovers an expired execution lease and fences the stale owner', async () => {
    let now = 1_000;
    const store = createInMemoryTaskStore({ maxTasks: 10, now: () => now });
    const first = createTaskRuntime({
      store,
      maxRunMs: 1_000,
      now: () => now,
    });
    const second = createTaskRuntime({
      store,
      maxRunMs: 1_000,
      now: () => now,
    });
    let release!: () => void;
    const blocked = new Promise<void>(resolve => {
      release = resolve;
    });
    await first.reserve({
      taskId: 'recoverable-task',
      accessToken: ACCESS_TOKEN,
    });
    await first.execute('recoverable-task', {
      execute: async () => {
        await blocked;
        return { output: 'stale' };
      },
    });

    now += 1_001;
    await second.execute('recoverable-task', {
      execute: async () => ({ output: 'recovered' }),
    });
    await tick();
    release();
    await tick();

    expect(
      (await second.get('recoverable-task', ACCESS_TOKEN))?.result
    ).toEqual({ output: 'recovered' });
  });

  it('leaves durable running work recoverable when a worker closes', async () => {
    let now = 1_000;
    const base = createInMemoryTaskStore({ maxTasks: 10, now: () => now });
    const durableStore: TaskStore = {
      ...base,
      durability: 'durable',
      close() {
        // A durable store outlives an individual worker runtime.
      },
    };
    const first = createTaskRuntime({
      store: durableStore,
      maxRunMs: 1_000,
      now: () => now,
    });
    const second = createTaskRuntime({
      store: durableStore,
      maxRunMs: 1_000,
      now: () => now,
    });
    await first.reserve({
      taskId: 'worker-shutdown',
      accessToken: ACCESS_TOKEN,
    });
    await first.execute('worker-shutdown', {
      execute: signal =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        }),
    });

    await first.close();
    expect((await base.get('worker-shutdown'))?.task.status).toBe('running');

    now += 1_001;
    await second.execute('worker-shutdown', {
      execute: async () => ({ output: 'recovered-after-shutdown' }),
    });
    await tick();

    expect((await second.get('worker-shutdown', ACCESS_TOKEN))?.result).toEqual(
      { output: 'recovered-after-shutdown' }
    );
    await second.close();
  });

  it('contains detached store failures so an expired lease remains recoverable', async () => {
    let now = 1_000;
    const base = createInMemoryTaskStore({ maxTasks: 10, now: () => now });
    let failCompletion = true;
    const store: TaskStore = {
      ...base,
      async compareAndSet(...args) {
        if (failCompletion && args[2].status === 'completed') {
          failCompletion = false;
          throw new Error('store unavailable');
        }
        return base.compareAndSet(...args);
      },
    };
    const runtime = createTaskRuntime({
      store,
      maxRunMs: 1_000,
      now: () => now,
    });
    await runtime.reserve({
      taskId: 'store-failure',
      accessToken: ACCESS_TOKEN,
    });
    await runtime.execute('store-failure', {
      execute: async () => ({ output: 'lost-result' }),
    });
    await tick();

    expect((await runtime.get('store-failure', ACCESS_TOKEN))?.status).toBe(
      'running'
    );
    now += 1_001;
    await runtime.execute('store-failure', {
      execute: async () => ({ output: 'recovered-result' }),
    });
    await tick();

    expect((await runtime.get('store-failure', ACCESS_TOKEN))?.result).toEqual({
      output: 'recovered-result',
    });
  });

  it('publishes mapped execution failures as durable terminal tasks', async () => {
    const runtime = createTaskRuntime({
      store: createInMemoryTaskStore({ maxTasks: 10 }),
    });
    const events: TaskUpdateEvent[] = [];
    await runtime.reserve({
      taskId: 'mapped-failure',
      accessToken: ACCESS_TOKEN,
    });
    await runtime.subscribe('mapped-failure', ACCESS_TOKEN, event => {
      events.push(event);
    });
    await runtime.execute('mapped-failure', {
      execute: async () => {
        throw new Error('provider offline');
      },
      mapError: error => ({
        code: 'provider_error',
        message: (error as Error).message,
        details: { retryable: true },
      }),
    });
    await tick();

    const failed = await runtime.get('mapped-failure', ACCESS_TOKEN);
    expect(failed?.status).toBe('failed');
    expect(failed?.error).toEqual({
      code: 'provider_error',
      message: 'provider offline',
      details: { retryable: true },
    });
    expect(events).toEqual([
      {
        type: 'error',
        data: {
          taskId: 'mapped-failure',
          status: 'failed',
          error: failed?.error,
        },
      },
    ]);
  });

  it('fails and aborts work that exceeds its execution lease', async () => {
    const runtime = createTaskRuntime({
      store: createInMemoryTaskStore({ maxTasks: 10 }),
      maxRunMs: 5,
    });
    let abortReason: unknown;
    await runtime.start({
      taskId: 'timed-out',
      accessToken: ACCESS_TOKEN,
      execute: signal =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              abortReason = signal.reason;
              reject(signal.reason);
            },
            { once: true }
          );
        }),
    });
    await new Promise(resolve => setTimeout(resolve, 20));

    const failed = await runtime.get('timed-out', ACCESS_TOKEN);
    expect(failed?.status).toBe('failed');
    expect(failed?.error).toEqual({
      code: 'task_timeout',
      message: 'Task exceeded its 5ms execution limit',
    });
    expect(abortReason).toEqual(failed?.error);
    await runtime.close();
  });
});
