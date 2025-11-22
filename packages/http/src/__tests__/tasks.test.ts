import { randomUUID } from 'node:crypto';

import type {
  SendMessageRequest,
  Task,
  TaskStatus,
} from '@lucid-agents/types/a2a';
import type { AgentRuntime, EntrypointDef } from '@lucid-agents/types/core';
import { afterEach, describe, expect, it, mock } from 'bun:test';
import { z } from 'zod';

import { http } from '../index';
import type { InvokeResult } from '../invoke';
import { ZodValidationError } from '@lucid-agents/types/core';

const meta = {
  name: 'test-agent',
  version: '1.0.0',
  description: 'Test agent',
};

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
      getEntrypoint: (key: string) => entrypoints.get(key),
      invoke: invokeFn || defaultInvoke,
    },
    config: {},
    entrypoints: {
      add: (def: EntrypointDef) => {
        entrypoints.set(def.key, def);
      },
      list: () =>
        Array.from(entrypoints.values()).map(e => ({
          key: e.key,
          description: e.description,
          streaming: !!e.streaming,
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
  ext.build({
    meta,
    config: {},
    runtime: {},
  });
  const runtime = makeMockRuntime(entrypoints, invokeFn);
  ext.onBuild?.(runtime);
  // Handlers are attached to runtime in onBuild
  return {
    handlers: (runtime as any).handlers!,
    runtime,
    entrypoints,
  };
};

describe('Task Operations', () => {
  describe('POST /tasks - Create Task', () => {
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

      const taskId1 = await createTask('hello1');
      const taskId2 = await createTask('hello2');

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
      let taskAborted = false;

      entrypoints.set('slow', {
        key: 'slow',
        description: 'Slow endpoint',
        input: z.object({ delay: z.number() }),
        output: z.object({ done: z.boolean() }),
        handler: async ctx => {
          const input = ctx.input as { delay: number };
          if (ctx.signal?.aborted) {
            taskAborted = true;
            throw new Error('Task aborted');
          }
          await new Promise(resolve => setTimeout(resolve, input.delay));
          if (ctx.signal?.aborted) {
            taskAborted = true;
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
