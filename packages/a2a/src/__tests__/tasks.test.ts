import type { AgentCardWithEntrypoints } from '@lucid-agents/types/a2a';
import type {
  SendMessageResponse,
  Task,
  TaskStatus,
} from '@lucid-agents/types/a2a';
import { describe, expect, it, mock } from 'bun:test';

import {
  sendMessage,
  getTask,
  subscribeTask,
  fetchAndSendMessage,
  listTasks,
  cancelTask,
} from '../client';
import { fetchAgentCard } from '../card';

// Helper to create Response with statusText
function createResponse(
  body: BodyInit | null,
  init?: ResponseInit & { statusText?: string }
): Response {
  const response = new Response(body, init);
  if (init?.statusText) {
    Object.defineProperty(response, 'statusText', {
      value: init.statusText,
      writable: false,
      enumerable: true,
      configurable: true,
    });
  }
  return response;
}

// Mock fetch implementation
const makeMockFetch = (responses: Map<string, Response>) => {
  return mock((input: RequestInfo | URL, _init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const response = responses.get(url);
    if (!response) {
      throw new Error(`Unexpected fetch to: ${url}`);
    }
    return Promise.resolve(response);
  });
};

describe('Task-based A2A Client Methods', () => {
  const mockCard: AgentCardWithEntrypoints = {
    name: 'test-agent',
    version: '1.0.0',
    description: 'Test agent',
    url: 'https://agent.example.com/',
    skills: [
      {
        id: 'echo',
        name: 'echo',
        description: 'Echo endpoint',
        inputModes: ['application/json'],
        outputModes: ['application/json'],
        streaming: false,
      },
    ],
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    supportsAuthenticatedExtendedCard: false,
    entrypoints: {
      echo: {
        description: 'Echo endpoint',
        streaming: false,
      },
    },
  };

  describe('sendMessage', () => {
    it('creates task and returns taskId with running status', async () => {
      const taskId = 'test-task-id';
      const sendResponse: SendMessageResponse = {
        taskId,
        status: 'running',
      };

      const responses = new Map<string, Response>([
        [
          'https://agent.example.com/tasks',
          new Response(JSON.stringify(sendResponse), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ],
      ]);

      const fetchFn = makeMockFetch(responses);
      const result = await sendMessage(
        mockCard,
        'echo',
        { text: 'hello' },
        fetchFn
      );

      expect(result.taskId).toBe(taskId);
      expect(result.status).toBe('running');

      // Verify fetch was called with correct URL
      expect(fetchFn).toHaveBeenCalledTimes(1);
      const call = fetchFn.mock.calls[0];
      expect(call[0]).toBe('https://agent.example.com/tasks');
      expect(call[1]?.method).toBe('POST');
    });

    it('constructs correct A2A SendMessageRequest format', async () => {
      const taskId = 'test-task-id';
      const sendResponse: SendMessageResponse = {
        taskId,
        status: 'running',
      };

      const responses = new Map<string, Response>([
        [
          'https://agent.example.com/tasks',
          new Response(JSON.stringify(sendResponse), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ],
      ]);

      const fetchFn = makeMockFetch(responses);
      await sendMessage(mockCard, 'echo', { text: 'hello' }, fetchFn);

      // Verify request body format
      const call = fetchFn.mock.calls[0];
      const requestBody = JSON.parse(call[1]?.body as string);
      expect(requestBody).toEqual({
        message: {
          role: 'user',
          content: { text: JSON.stringify({ text: 'hello' }) },
        },
        skillId: 'echo',
      });
    });

    it('throws error if skillId not found in card', async () => {
      const cardWithoutSkill: AgentCardWithEntrypoints = {
        ...mockCard,
        skills: [],
      };

      await expect(
        sendMessage(cardWithoutSkill, 'nonexistent', { text: 'hello' })
      ).rejects.toThrow('Skill "nonexistent" not found in Agent Card');
    });

    it('throws error if card missing url', async () => {
      const cardWithoutUrl: AgentCardWithEntrypoints = {
        ...mockCard,
        url: undefined,
      };

      await expect(
        sendMessage(cardWithoutUrl, 'echo', { text: 'hello' })
      ).rejects.toThrow('Agent Card missing url field');
    });

    it('handles HTTP errors', async () => {
      const responses = new Map<string, Response>([
        [
          'https://agent.example.com/tasks',
          createResponse(
            JSON.stringify({ error: { code: 'internal_error' } }),
            {
              status: 500,
              statusText: 'Internal Server Error',
              headers: { 'Content-Type': 'application/json' },
            }
          ),
        ],
      ]);

      const fetchFn = makeMockFetch(responses);

      await expect(
        sendMessage(mockCard, 'echo', { text: 'hello' }, fetchFn)
      ).rejects.toThrow('Task creation failed: 500 Internal Server Error');
    });
  });

  describe('getTask', () => {
    it('retrieves task status', async () => {
      const taskId = 'test-task-id';
      const task: Task = {
        taskId,
        status: 'completed',
        result: {
          output: { text: 'echo: hello' },
          usage: { total_tokens: 10 },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const responses = new Map<string, Response>([
        [
          `https://agent.example.com/tasks/${taskId}`,
          new Response(JSON.stringify(task), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ],
      ]);

      const fetchFn = makeMockFetch(responses);
      const result = await getTask(mockCard, taskId, fetchFn);

      expect(result.taskId).toBe(taskId);
      expect(result.status).toBe('completed');
      expect(result.result).toBeDefined();
      expect(result.result?.output).toEqual({ text: 'echo: hello' });

      // Verify fetch was called with correct URL
      expect(fetchFn).toHaveBeenCalledTimes(1);
      const call = fetchFn.mock.calls[0];
      expect(call[0]).toBe(`https://agent.example.com/tasks/${taskId}`);
      expect(call[1]?.method).toBe('GET');
    });

    it('returns task with running status', async () => {
      const taskId = 'test-task-id';
      const task: Task = {
        taskId,
        status: 'running',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const responses = new Map<string, Response>([
        [
          `https://agent.example.com/tasks/${taskId}`,
          new Response(JSON.stringify(task), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ],
      ]);

      const fetchFn = makeMockFetch(responses);
      const result = await getTask(mockCard, taskId, fetchFn);

      expect(result.status).toBe('running');
      expect(result.result).toBeUndefined();
    });

    it('returns task with failed status', async () => {
      const taskId = 'test-task-id';
      const task: Task = {
        taskId,
        status: 'failed',
        error: {
          code: 'internal_error',
          message: 'Handler failed',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const responses = new Map<string, Response>([
        [
          `https://agent.example.com/tasks/${taskId}`,
          new Response(JSON.stringify(task), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ],
      ]);

      const fetchFn = makeMockFetch(responses);
      const result = await getTask(mockCard, taskId, fetchFn);

      expect(result.status).toBe('failed');
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('internal_error');
    });

    it('handles HTTP errors', async () => {
      const taskId = 'test-task-id';
      const responses = new Map<string, Response>([
        [
          `https://agent.example.com/tasks/${taskId}`,
          createResponse(
            JSON.stringify({ error: { code: 'task_not_found' } }),
            {
              status: 404,
              statusText: 'Not Found',
              headers: { 'Content-Type': 'application/json' },
            }
          ),
        ],
      ]);

      const fetchFn = makeMockFetch(responses);

      await expect(getTask(mockCard, taskId, fetchFn)).rejects.toThrow(
        'Failed to get task: 404 Not Found'
      );
    });

    it('throws error if card missing url', async () => {
      const cardWithoutUrl: AgentCardWithEntrypoints = {
        ...mockCard,
        url: undefined,
      };

      await expect(getTask(cardWithoutUrl, 'task-id')).rejects.toThrow(
        'Agent Card missing url field'
      );
    });
  });

  describe('subscribeTask', () => {
    it('streams task updates via SSE', async () => {
      const taskId = 'test-task-id';
      const events = [
        'event: statusUpdate\n',
        'data: {"taskId":"test-task-id","status":"running"}\n\n',
        'event: resultUpdate\n',
        'data: {"taskId":"test-task-id","status":"completed","result":{"output":{"text":"hello"}}}\n\n',
      ].join('');

      const responses = new Map<string, Response>([
        [
          `https://agent.example.com/tasks/${taskId}/subscribe`,
          new Response(
            new ReadableStream({
              start(controller) {
                const encoder = new TextEncoder();
                controller.enqueue(encoder.encode(events));
                controller.close();
              },
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
              },
            }
          ),
        ],
      ]);

      const fetchFn = makeMockFetch(responses);
      const emittedEvents: Array<{ type: string; data: unknown }> = [];

      const emit: (chunk: {
        type: string;
        data: unknown;
      }) => Promise<void> = async chunk => {
        emittedEvents.push(chunk);
      };

      await subscribeTask(mockCard, taskId, emit, fetchFn);

      // Verify events were emitted
      expect(emittedEvents.length).toBeGreaterThan(0);
      const statusUpdate = emittedEvents.find(e => e.type === 'statusUpdate');
      expect(statusUpdate).toBeDefined();
      expect(statusUpdate?.data).toHaveProperty('taskId', taskId);
    });

    it('throws error if card missing url', async () => {
      const cardWithoutUrl: AgentCardWithEntrypoints = {
        ...mockCard,
        url: undefined,
      };

      const emit = async (_chunk: { type: string; data: unknown }) => {};

      await expect(
        subscribeTask(cardWithoutUrl, 'task-id', emit)
      ).rejects.toThrow('Agent Card missing url field');
    });
  });

  describe('fetchAndSendMessage', () => {
    it('fetches card and sends message in one call', async () => {
      const taskId = 'test-task-id';
      const sendResponse: SendMessageResponse = {
        taskId,
        status: 'running',
      };

      const cardResponse = new Response(JSON.stringify(mockCard), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      const taskResponse = new Response(JSON.stringify(sendResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      // fetchAgentCard tries multiple URLs, so we need to handle all of them
      const responses = new Map<string, Response>([
        ['https://agent.example.com', new Response('Not Found', { status: 404 })], // First attempt
        ['https://agent.example.com/.well-known/agent-card.json', cardResponse], // Spec path (succeeds)
        ['https://agent.example.com/.well-known/agent.json', new Response('Not Found', { status: 404 })], // Alternative
        ['https://agent.example.com/agentcard.json', new Response('Not Found', { status: 404 })], // Legacy
        ['https://agent.example.com/tasks', taskResponse],
      ]);

      const fetchFn = makeMockFetch(responses);
      const result = await fetchAndSendMessage(
        'https://agent.example.com',
        'echo',
        { text: 'hello' },
        fetchFn
      );

      expect(result.taskId).toBe(taskId);
      expect(result.status).toBe('running');

      // fetchAgentCard tries multiple URLs before succeeding, then tasks endpoint is called
      expect(fetchFn).toHaveBeenCalledTimes(3); // 2 card attempts + 1 tasks call
    });

    it('throws error if card fetch fails', async () => {
      // Return 404 for all possible agent card URLs that fetchAgentCard tries
      // Note: fetchAgentCard tries baseUrl as-is first (may have trailing slash), then normalized versions
      const responses = new Map<string, Response>([
        ['https://agent.example.com', new Response('Not Found', { status: 404 })], // First attempt (as-is)
        ['https://agent.example.com/', new Response('Not Found', { status: 404 })], // If baseUrl has trailing slash
        [
          'https://agent.example.com/.well-known/agent-card.json',
          new Response('Not Found', { status: 404 }),
        ],
        [
          'https://agent.example.com/.well-known/agent.json',
          new Response('Not Found', { status: 404 }),
        ],
        [
          'https://agent.example.com/agentcard.json',
          new Response('Not Found', { status: 404 }),
        ],
      ]);

      const fetchFn = makeMockFetch(responses);

      await expect(
        fetchAndSendMessage(
          'https://agent.example.com',
          'echo',
          { text: 'hello' },
          fetchFn
        )
      ).rejects.toThrow('Failed to fetch Agent Card');
    });
  });

  describe('listTasks', () => {
    it('lists all tasks without filters', async () => {
      const card: AgentCardWithEntrypoints = {
        url: 'https://agent.example.com',
        name: 'test-agent',
        version: '1.0.0',
        entrypoints: {
          tasks: {
            description: 'Task operations',
            streaming: false,
          },
        },
      };

      const mockTasks = [
        {
          taskId: 'task-1',
          status: 'completed' as TaskStatus,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:01Z',
        },
        {
          taskId: 'task-2',
          status: 'running' as TaskStatus,
          createdAt: '2024-01-01T00:00:02Z',
          updatedAt: '2024-01-01T00:00:02Z',
        },
      ];

      const responses = new Map<string, Response>();
      responses.set(
        'https://agent.example.com/tasks',
        createResponse(
          JSON.stringify({
            tasks: mockTasks,
            total: 2,
            hasMore: false,
          }),
          { status: 200, statusText: 'OK' }
        )
      );

      const fetchFn = makeMockFetch(responses);

      const result = await listTasks(card, undefined, fetchFn);

      expect(result.tasks).toHaveLength(2);
      expect(result.tasks[0].taskId).toBe('task-1');
      expect(result.tasks[1].taskId).toBe('task-2');
      expect(result.total).toBe(2);
      expect(result.hasMore).toBe(false);
    });

    it('filters tasks by contextId', async () => {
      const card: AgentCardWithEntrypoints = {
        url: 'https://agent.example.com',
        name: 'test-agent',
        version: '1.0.0',
        entrypoints: {
          tasks: {
            description: 'Task operations',
            streaming: false,
          },
        },
      };

      const mockTasks = [
        {
          taskId: 'task-1',
          status: 'completed' as TaskStatus,
          contextId: 'context-1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:01Z',
        },
      ];

      const responses = new Map<string, Response>();
      responses.set(
        'https://agent.example.com/tasks?contextId=context-1',
        createResponse(
          JSON.stringify({
            tasks: mockTasks,
            total: 1,
            hasMore: false,
          }),
          { status: 200, statusText: 'OK' }
        )
      );

      const fetchFn = makeMockFetch(responses);

      const result = await listTasks(card, { contextId: 'context-1' }, fetchFn);

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].contextId).toBe('context-1');
    });

    it('filters tasks by status', async () => {
      const card: AgentCardWithEntrypoints = {
        url: 'https://agent.example.com',
        name: 'test-agent',
        version: '1.0.0',
        entrypoints: {
          tasks: {
            description: 'Task operations',
            streaming: false,
          },
        },
      };

      const mockTasks = [
        {
          taskId: 'task-1',
          status: 'completed' as TaskStatus,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:01Z',
        },
      ];

      const responses = new Map<string, Response>();
      responses.set(
        'https://agent.example.com/tasks?status=completed',
        createResponse(
          JSON.stringify({
            tasks: mockTasks,
            total: 1,
            hasMore: false,
          }),
          { status: 200, statusText: 'OK' }
        )
      );

      const fetchFn = makeMockFetch(responses);

      const result = await listTasks(card, { status: 'completed' }, fetchFn);

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].status).toBe('completed');
    });

    it('supports pagination', async () => {
      const card: AgentCardWithEntrypoints = {
        url: 'https://agent.example.com',
        name: 'test-agent',
        version: '1.0.0',
        entrypoints: {
          tasks: {
            description: 'Task operations',
            streaming: false,
          },
        },
      };

      const responses = new Map<string, Response>();
      responses.set(
        'https://agent.example.com/tasks?limit=10&offset=20',
        createResponse(
          JSON.stringify({
            tasks: [],
            total: 30,
            hasMore: true,
          }),
          { status: 200, statusText: 'OK' }
        )
      );

      const fetchFn = makeMockFetch(responses);

      const result = await listTasks(card, { limit: 10, offset: 20 }, fetchFn);

      expect(result.total).toBe(30);
      expect(result.hasMore).toBe(true);
    });

    it('handles HTTP errors', async () => {
      const card: AgentCardWithEntrypoints = {
        url: 'https://agent.example.com',
        name: 'test-agent',
        version: '1.0.0',
        entrypoints: {
          tasks: {
            description: 'Task operations',
            streaming: false,
          },
        },
      };

      const responses = new Map<string, Response>();
      responses.set(
        'https://agent.example.com/tasks',
        createResponse('Internal Server Error', {
          status: 500,
          statusText: 'Internal Server Error',
        })
      );

      const fetchFn = makeMockFetch(responses);

      await expect(listTasks(card, undefined, fetchFn)).rejects.toThrow(
        'Failed to list tasks: 500 Internal Server Error'
      );
    });
  });

  describe('cancelTask', () => {
    it('cancels a task successfully', async () => {
      const card: AgentCardWithEntrypoints = {
        url: 'https://agent.example.com',
        name: 'test-agent',
        version: '1.0.0',
        entrypoints: {
          tasks: {
            description: 'Task operations',
            streaming: false,
          },
        },
      };

      const mockTask: Task = {
        taskId: 'task-1',
        status: 'cancelled',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:01Z',
      };

      const responses = new Map<string, Response>();
      responses.set(
        'https://agent.example.com/tasks/task-1/cancel',
        createResponse(JSON.stringify(mockTask), {
          status: 200,
          statusText: 'OK',
        })
      );

      const fetchFn = makeMockFetch(responses);

      const result = await cancelTask(card, 'task-1', fetchFn);

      expect(result.taskId).toBe('task-1');
      expect(result.status).toBe('cancelled');
    });

    it('handles HTTP errors', async () => {
      const card: AgentCardWithEntrypoints = {
        url: 'https://agent.example.com',
        name: 'test-agent',
        version: '1.0.0',
        entrypoints: {
          tasks: {
            description: 'Task operations',
            streaming: false,
          },
        },
      };

      const responses = new Map<string, Response>();
      responses.set(
        'https://agent.example.com/tasks/non-existent/cancel',
        createResponse('Task not found', {
          status: 404,
          statusText: 'Not Found',
        })
      );

      const fetchFn = makeMockFetch(responses);

      await expect(cancelTask(card, 'non-existent', fetchFn)).rejects.toThrow(
        'Failed to cancel task: 404 Not Found'
      );
    });
  });
});
