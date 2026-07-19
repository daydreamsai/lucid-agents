import type {
  A2ATaskRuntime,
  ExecuteTaskOptions,
  StoredTask,
  Task,
  TaskError,
  TaskResult,
  TaskStatus,
  TaskStore,
  TaskUpdateEvent,
} from '@lucid-agents/types/a2a';

const TERMINAL_STATUSES = new Set<TaskStatus>([
  'completed',
  'failed',
  'cancelled',
]);

export class TaskCapacityError extends Error {
  constructor(maxTasks: number) {
    super(`A2A task capacity (${maxTasks}) is exhausted by active tasks`);
    this.name = 'TaskCapacityError';
  }
}

export type InMemoryTaskStoreOptions = {
  maxTasks?: number;
  retentionMs?: number;
  now?: () => number;
};

/**
 * Bounded process-local TaskStore. Production deployments can inject a
 * durable store through `a2a({ tasks: { store } })` without changing the
 * task state machine or HTTP transport.
 */
export function createInMemoryTaskStore(
  options: InMemoryTaskStoreOptions = {}
): TaskStore {
  const maxTasks = options.maxTasks ?? 1_000;
  const retentionMs = options.retentionMs ?? 24 * 60 * 60 * 1_000;
  const now = options.now ?? Date.now;
  const tasks = new Map<string, StoredTask>();
  const listeners = new Map<
    string,
    Set<(event: TaskUpdateEvent) => void | Promise<void>>
  >();

  if (!Number.isSafeInteger(maxTasks) || maxTasks < 1) {
    throw new Error('maxTasks must be a positive integer');
  }
  if (!Number.isFinite(retentionMs) || retentionMs < 0) {
    throw new Error('retentionMs must be a non-negative number');
  }

  const publish = (taskId: string, event: TaskUpdateEvent): void => {
    for (const listener of listeners.get(taskId) ?? []) {
      Promise.resolve(listener(event)).catch(error => {
        console.error('[lucid-agents/a2a] Task subscriber failed', error);
      });
    }
  };

  const remove = (taskId: string): void => {
    tasks.delete(taskId);
    listeners.delete(taskId);
  };

  const purgeExpired = (): void => {
    const cutoff = now() - retentionMs;
    for (const [taskId, record] of tasks) {
      const { task } = record;
      if (
        TERMINAL_STATUSES.has(task.status) &&
        Date.parse(task.updatedAt) <= cutoff
      ) {
        remove(taskId);
      }
    }
  };

  const ensureCapacity = (): void => {
    purgeExpired();
    while (tasks.size >= maxTasks) {
      const oldestTerminal = [...tasks.values()]
        .map(record => record.task)
        .filter(task => TERMINAL_STATUSES.has(task.status))
        .sort(
          (left, right) =>
            Date.parse(left.updatedAt) - Date.parse(right.updatedAt)
        )[0];
      if (!oldestTerminal) throw new TaskCapacityError(maxTasks);
      remove(oldestTerminal.taskId);
    }
  };

  return {
    async create(record, event) {
      if (tasks.has(record.task.taskId)) {
        throw new Error(`Task "${record.task.taskId}" already exists`);
      }
      ensureCapacity();
      tasks.set(record.task.taskId, record);
      publish(record.task.taskId, event);
    },
    async get(taskId) {
      purgeExpired();
      return tasks.get(taskId);
    },
    async list(ownerHash, filters = {}) {
      purgeExpired();
      const statuses = filters.status
        ? Array.isArray(filters.status)
          ? filters.status
          : [filters.status]
        : undefined;
      const offset = Math.max(0, filters.offset ?? 0);
      const limit = Math.max(0, Math.min(filters.limit ?? 50, 1_000));
      const filtered = [...tasks.values()]
        .filter(record => record.ownerHash === ownerHash)
        .map(record => record.task)
        .filter(
          task => !filters.contextId || task.contextId === filters.contextId
        )
        .filter(task => !statuses || statuses.includes(task.status))
        .sort(
          (left, right) =>
            Date.parse(right.createdAt) - Date.parse(left.createdAt)
        );
      return {
        tasks: filtered.slice(offset, offset + limit),
        total: filtered.length,
        hasMore: offset + limit < filtered.length,
      };
    },
    async claimExecution(taskId, ownerId, expiresAt, claimedAt) {
      purgeExpired();
      const current = tasks.get(taskId);
      if (!current || current.task.status !== 'running') return undefined;
      if (
        current.executionLease &&
        current.executionLease.expiresAt > claimedAt
      ) {
        return undefined;
      }
      tasks.set(taskId, {
        ...current,
        executionLease: { ownerId, expiresAt },
      });
      return current.task;
    },
    async compareAndSet(taskId, expected, next, event, executionOwnerId) {
      purgeExpired();
      const current = tasks.get(taskId);
      if (!current || !expected.includes(current.task.status)) return undefined;
      if (
        executionOwnerId &&
        current.executionLease?.ownerId !== executionOwnerId
      ) {
        return undefined;
      }
      tasks.set(taskId, {
        ...current,
        task: next,
        executionLease: TERMINAL_STATUSES.has(next.status)
          ? undefined
          : current.executionLease,
      });
      publish(taskId, event);
      return next;
    },
    subscribe(taskId, ownerHash, listener) {
      if (tasks.get(taskId)?.ownerHash !== ownerHash) return () => {};
      const taskListeners = listeners.get(taskId) ?? new Set();
      taskListeners.add(listener);
      listeners.set(taskId, taskListeners);
      return () => {
        taskListeners.delete(listener);
        if (taskListeners.size === 0) listeners.delete(taskId);
      };
    },
    close() {
      tasks.clear();
      listeners.clear();
    },
  };
}

export type CreateTaskRuntimeOptions = {
  store: TaskStore;
  maxRunMs?: number;
  now?: () => number;
};

function defaultTaskError(error: unknown): TaskError {
  return {
    code: 'internal_error',
    message: error instanceof Error ? error.message : 'Task failed',
  };
}

async function hashAccessToken(accessToken: string): Promise<string> {
  const normalized = accessToken.trim();
  if (normalized.length < 20 || normalized.length > 256) {
    throw new Error('Task access token must contain 20 to 256 characters');
  }
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(normalized)
  );
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Create the owned A2A task state machine over an atomic TaskStore. Execution
 * is fenced by expiring leases so only one worker may publish a terminal
 * transition and another worker can recover an abandoned running task.
 */
export function createTaskRuntime(
  options: CreateTaskRuntimeOptions
): A2ATaskRuntime {
  const now = options.now ?? Date.now;
  const maxRunMs = options.maxRunMs ?? 15 * 60 * 1_000;
  const controllers = new Map<string, AbortController>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  if (!Number.isFinite(maxRunMs) || maxRunMs <= 0) {
    throw new Error('maxRunMs must be a positive number');
  }

  const timestamp = () => new Date(now()).toISOString();
  const clearExecution = (taskId: string): void => {
    controllers.delete(taskId);
    const timer = timers.get(taskId);
    if (timer) clearTimeout(timer);
    timers.delete(taskId);
  };

  const getOwnedTask = async (
    taskId: string,
    accessToken: string
  ): Promise<Task | undefined> => {
    const ownerHash = await hashAccessToken(accessToken);
    const record = await options.store.get(taskId);
    return record?.ownerHash === ownerHash ? record.task : undefined;
  };

  const cancelStoredTask = async (
    taskId: string
  ): Promise<Task | undefined> => {
    const record = await options.store.get(taskId);
    if (!record) return undefined;
    const current = record.task;
    const cancelled: Task = {
      ...current,
      status: 'cancelled',
      updatedAt: timestamp(),
    };
    const transitioned = await options.store.compareAndSet(
      taskId,
      ['running'],
      cancelled,
      {
        type: 'statusUpdate',
        data: { taskId, status: 'cancelled' },
      }
    );
    if (transitioned)
      controllers.get(taskId)?.abort(new Error('Task cancelled'));
    return transitioned ?? current;
  };

  const run = async (
    task: Task,
    controller: AbortController,
    startOptions: ExecuteTaskOptions,
    executionOwnerId: string
  ): Promise<void> => {
    try {
      let result: TaskResult;
      try {
        result = await startOptions.execute(controller.signal);
      } catch (error) {
        if (controller.signal.aborted) return;
        const taskError =
          startOptions.mapError?.(error) ?? defaultTaskError(error);
        const failed: Task = {
          ...task,
          status: 'failed',
          error: taskError,
          updatedAt: timestamp(),
        };
        await options.store.compareAndSet(
          task.taskId,
          ['running'],
          failed,
          {
            type: 'error',
            data: {
              taskId: task.taskId,
              status: 'failed',
              error: taskError,
            },
          },
          executionOwnerId
        );
        return;
      }
      const completed: Task = {
        ...task,
        status: 'completed',
        result,
        updatedAt: timestamp(),
      };
      await options.store.compareAndSet(
        task.taskId,
        ['running'],
        completed,
        {
          type: 'resultUpdate',
          data: {
            taskId: task.taskId,
            status: 'completed',
            result,
          },
        },
        executionOwnerId
      );
    } finally {
      clearExecution(task.taskId);
    }
  };

  const runtime: A2ATaskRuntime = {
    async reserve(startOptions) {
      const createdAt = timestamp();
      const task: Task = {
        taskId: startOptions.taskId,
        status: 'running',
        contextId: startOptions.contextId,
        createdAt,
        updatedAt: createdAt,
      };
      await options.store.create(
        {
          task,
          ownerHash: await hashAccessToken(startOptions.accessToken),
        },
        {
          type: 'statusUpdate',
          data: { taskId: task.taskId, status: 'running' },
        }
      );
      return task;
    },
    async execute(taskId, executeOptions) {
      if (controllers.has(taskId)) {
        throw new Error(`Task "${taskId}" is already executing`);
      }
      const executionOwnerId = globalThis.crypto.randomUUID();
      const task = await options.store.claimExecution(
        taskId,
        executionOwnerId,
        now() + maxRunMs,
        now()
      );
      if (!task) {
        const record = await options.store.get(taskId);
        if (!record) throw new Error(`Task "${taskId}" not found`);
        if (record.task.status !== 'running') {
          throw new Error(`Task "${taskId}" is not running`);
        }
        throw new Error(`Task "${taskId}" is already executing`);
      }
      const controller = new AbortController();
      controllers.set(task.taskId, controller);
      timers.set(
        task.taskId,
        setTimeout(() => {
          const timeoutError: TaskError = {
            code: 'task_timeout',
            message: `Task exceeded its ${maxRunMs}ms execution limit`,
          };
          void options.store
            .compareAndSet(
              task.taskId,
              ['running'],
              {
                ...task,
                status: 'failed',
                error: timeoutError,
                updatedAt: timestamp(),
              },
              {
                type: 'error',
                data: {
                  taskId: task.taskId,
                  status: 'failed',
                  error: timeoutError,
                },
              },
              executionOwnerId
            )
            .catch(error => {
              console.error(
                '[lucid-agents/a2a] Failed to persist task timeout',
                error
              );
            })
            .finally(() => controller.abort(timeoutError));
        }, maxRunMs)
      );
      void run(task, controller, executeOptions, executionOwnerId).catch(
        error => {
          console.error(
            '[lucid-agents/a2a] Failed to persist task execution result',
            error
          );
        }
      );
      return task;
    },
    async start(startOptions) {
      const task = await runtime.reserve(startOptions);
      await runtime.execute(task.taskId, startOptions);
      return task;
    },
    get: getOwnedTask,
    async list(accessToken, filters) {
      return options.store.list(await hashAccessToken(accessToken), filters);
    },
    async cancel(taskId, accessToken) {
      if (!(await getOwnedTask(taskId, accessToken))) return undefined;
      return cancelStoredTask(taskId);
    },
    async subscribe(taskId, accessToken, listener) {
      return options.store.subscribe(
        taskId,
        await hashAccessToken(accessToken),
        listener
      );
    },
    async close() {
      for (const controller of controllers.values()) {
        controller.abort(new Error('Task runtime closed'));
      }
      for (const timer of timers.values()) clearTimeout(timer);
      controllers.clear();
      timers.clear();
      await options.store.close?.();
    },
  };

  return runtime;
}
