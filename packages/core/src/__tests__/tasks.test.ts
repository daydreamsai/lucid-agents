import { randomUUID } from 'node:crypto';

import type {
  SendMessageRequest,
  Task,
  TaskStatus,
} from '@lucid-agents/types/a2a';
import { afterEach, describe, expect, it } from 'bun:test';
import { z } from 'zod';

import { resetAgentKitConfigForTesting } from '../config/config';
import { createAgentHttpRuntime } from '../http/runtime';

const makeTestRuntime = () => {
  return createAgentHttpRuntime(
    {
      name: 'test-agent',
      version: '1.0.0',
      description: 'Test agent',
    },
    {}
  );
};

describe('Task Operations', () => {
  afterEach(() => {
    resetAgentKitConfigForTesting();
  });

  describe('POST /tasks - Create Task', () => {
    it('creates a task and returns taskId with running status', async () => {
      const runtime = makeTestRuntime();
      runtime.entrypoints.add({
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

      const response = await runtime.handlers.tasks(request);
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
      const runtime = makeTestRuntime();
      let handlerCalled = false;

      runtime.entrypoints.add({
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
      const response = await runtime.handlers.tasks(request);
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
      const runtime = makeTestRuntime();

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

      const response = await runtime.handlers.tasks(request);
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect((data as { error: { code: string } }).error.code).toBe(
        'skill_not_found'
      );
    });

    it('returns 400 if request body is invalid', async () => {
      const runtime = makeTestRuntime();

      const request = new Request('http://localhost/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: 'data' }),
      });

      const response = await runtime.handlers.tasks(request);
      expect(response.status).toBe(400);
    });
  });

  describe('GET /tasks/{taskId} - Get Task Status', () => {
    it('returns task with running status immediately after creation', async () => {
      const runtime = makeTestRuntime();
      runtime.entrypoints.add({
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

      const createResponse = await runtime.handlers.tasks(createRequest);
      const { taskId } = (await createResponse.json()) as { taskId: string };

      // Get task status immediately (should be running)
      const getRequest = new Request(`http://localhost/tasks/${taskId}`, {
        method: 'GET',
      });

      const getResponse = await runtime.handlers.getTask(getRequest, {
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
      const runtime = makeTestRuntime();
      runtime.entrypoints.add({
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

      const createResponse = await runtime.handlers.tasks(createRequest);
      const { taskId } = (await createResponse.json()) as { taskId: string };

      // Wait for task to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get task status (should be completed)
      const getRequest = new Request(`http://localhost/tasks/${taskId}`, {
        method: 'GET',
      });

      const getResponse = await runtime.handlers.getTask(getRequest, {
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
      const runtime = makeTestRuntime();
      runtime.entrypoints.add({
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

      const createResponse = await runtime.handlers.tasks(createRequest);
      const { taskId } = (await createResponse.json()) as { taskId: string };

      // Wait for task to fail
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get task status (should be failed)
      const getRequest = new Request(`http://localhost/tasks/${taskId}`, {
        method: 'GET',
      });

      const getResponse = await runtime.handlers.getTask(getRequest, {
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
      const runtime = makeTestRuntime();
      const fakeTaskId = randomUUID();

      const request = new Request(`http://localhost/tasks/${fakeTaskId}`, {
        method: 'GET',
      });

      const response = await runtime.handlers.getTask(request, {
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
      const runtime = makeTestRuntime();
      runtime.entrypoints.add({
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

      const createResponse = await runtime.handlers.tasks(createRequest);
      const { taskId } = (await createResponse.json()) as { taskId: string };

      // Subscribe to task updates
      const subscribeRequest = new Request(
        `http://localhost/tasks/${taskId}/subscribe`,
        {
          method: 'GET',
        }
      );

      const subscribeResponse = await runtime.handlers.subscribeTask(
        subscribeRequest,
        {
          taskId,
        }
      );
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
      const runtime = makeTestRuntime();
      runtime.entrypoints.add({
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

        return runtime.handlers.tasks(request);
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

        const getResponse = await runtime.handlers.getTask(getRequest, {
          taskId,
        });
        const task = (await getResponse.json()) as Task;
        expect(task.status).toBe('completed');
      }
    });
  });
});
