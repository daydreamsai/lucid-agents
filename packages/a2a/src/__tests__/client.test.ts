import { describe, expect, it, mock } from 'bun:test';
import type {
  A2AClient,
  AgentCardWithEntrypoints,
} from '@lucid-agents/types/a2a';

import {
  cancelTask,
  fetchAndInvoke,
  getTask,
  invokeAgent,
  listTasks,
  sendMessage,
  streamAgent,
  subscribeTask,
  TaskCreationError,
  waitForTask,
} from '../client';

describe('invokeAgent', () => {
  const card: AgentCardWithEntrypoints = {
    name: 'test-agent',
    version: '1.0.0',
    url: 'https://agent.example.com/',
    skills: [
      {
        id: 'echo',
        name: 'echo',
        description: 'Echo endpoint',
      },
    ],
    entrypoints: {
      echo: {
        description: 'Echo endpoint',
        streaming: false,
        input_schema: {
          type: 'object',
          properties: { text: { type: 'string' } },
        },
        output_schema: {
          type: 'object',
          properties: { text: { type: 'string' } },
        },
      },
    },
  };

  it('calls agent using Agent Card', async () => {
    const mockResponse = {
      run_id: 'test-run',
      status: 'completed',
      output: { text: 'echoed' },
    };

    const mockFetch = mock(
      async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr =
          typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.toString()
              : (url as Request).url;
        if (urlStr.includes('/entrypoints/echo/invoke')) {
          expect(init?.method).toBe('POST');
          const body = init?.body ? JSON.parse(init.body as string) : {};
          expect(body.input).toEqual({ text: 'hello' });
          return new Response(JSON.stringify(mockResponse), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      }
    );

    const result = await invokeAgent(
      card,
      'echo',
      { text: 'hello' },
      mockFetch as unknown as typeof fetch
    );

    expect(result).toBeDefined();
    expect(result.output).toEqual({ text: 'echoed' });
    expect(mockFetch).toHaveBeenCalled();
  });

  it('handles errors when skill not found', async () => {
    await expect(invokeAgent(card, 'nonexistent', {})).rejects.toThrow();
  });

  it('handles network errors', async () => {
    const mockFetch = mock(async () => {
      throw new Error('Network error');
    });

    await expect(
      invokeAgent(
        card,
        'echo',
        { text: 'hello' },
        mockFetch as unknown as typeof fetch
      )
    ).rejects.toThrow('Network error');
  });

  it('works with payment-enabled fetch', async () => {
    const mockResponse = {
      run_id: 'test-run',
      status: 'completed',
      output: { text: 'echoed' },
    };

    const mockFetch = mock(async () => {
      return new Response(JSON.stringify(mockResponse), {
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const result = await invokeAgent(
      card,
      'echo',
      { text: 'hello' },
      mockFetch as unknown as typeof fetch
    );

    expect(result).toBeDefined();
    expect(result.output).toEqual({ text: 'echoed' });
  });

  it('preserves the base path from the Agent Card URL', async () => {
    const pathCard = {
      ...card,
      url: 'https://agent.example.com/api/agent/',
    };
    let requestedUrl: string | undefined;
    const mockFetch = mock(async (input: string | URL | Request) => {
      requestedUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      return Response.json({ status: 'succeeded', output: {} });
    });

    await invokeAgent(
      pathCard,
      'echo',
      {},
      mockFetch as unknown as typeof fetch
    );

    expect(requestedUrl).toBe(
      'https://agent.example.com/api/agent/entrypoints/echo/invoke'
    );
  });

  it('prefers the advertised HTTP interface over the deprecated URL field', async () => {
    const interfaceCard = {
      ...card,
      url: 'https://agent.example.com/',
      supportedInterfaces: [
        {
          url: 'https://agent.example.com/api/agent/',
          protocolBinding: 'HTTP+JSON',
        },
      ],
    };
    let requestedUrl: string | undefined;
    const mockFetch = mock(async (input: string | URL | Request) => {
      requestedUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      return Response.json({ status: 'succeeded', output: {} });
    });

    await invokeAgent(
      interfaceCard,
      'echo',
      {},
      mockFetch as unknown as typeof fetch
    );

    expect(requestedUrl).toBe(
      'https://agent.example.com/api/agent/entrypoints/echo/invoke'
    );
  });

  it('propagates an idempotency key to the remote invocation', async () => {
    let requestHeaders: Headers | undefined;
    const mockFetch = mock(
      async (_input: string | URL | Request, init?: RequestInit) => {
        requestHeaders = new Headers(init?.headers);
        return Response.json({ status: 'succeeded', output: {} });
      }
    );

    const idempotencyKey = 'scheduler-job:00000000-0000-4000-8000-000000000001';
    await invokeAgent(card, 'echo', {}, mockFetch as unknown as typeof fetch, {
      idempotencyKey,
    });

    expect(requestHeaders?.get('Idempotency-Key')).toBe(idempotencyKey);
  });

  it('rejects an invalid idempotency key before making a request', async () => {
    const mockFetch = mock(async () =>
      Response.json({ status: 'succeeded', output: {} })
    );

    await expect(
      invokeAgent(card, 'echo', {}, mockFetch as unknown as typeof fetch, {
        idempotencyKey: 'too-short',
      })
    ).rejects.toThrow('20 to 256');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('streamAgent', () => {
  const card: AgentCardWithEntrypoints = {
    name: 'test-agent',
    version: '1.0.0',
    url: 'https://agent.example.com/',
    skills: [
      {
        id: 'stream',
        name: 'stream',
        description: 'Stream endpoint',
        streaming: true,
      },
    ],
    entrypoints: {
      stream: {
        description: 'Stream endpoint',
        streaming: true,
        input_schema: {
          type: 'object',
          properties: { text: { type: 'string' } },
        },
      },
    },
  };

  it('streams from agent using Agent Card', async () => {
    const mockEvents = [
      'event: run-start\n',
      'data: {"run_id":"test-run"}\n\n',
      'event: delta\n',
      'data: {"text":"hello"}\n\n',
      'event: run-end\n',
      'data: {"status":"completed"}\n\n',
    ].join('');

    const mockFetch = mock(async (url: string | URL | Request) => {
      const urlStr =
        typeof url === 'string'
          ? url
          : url instanceof URL
            ? url.toString()
            : (url as Request).url;
      if (urlStr.includes('/entrypoints/stream/stream')) {
        return new Response(mockEvents, {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }
      throw new Error(`Unexpected URL: ${urlStr}`);
    });

    const events: Array<{ type: string; data: unknown }> = [];
    const emit = mock((chunk: { type: string; data: unknown }) => {
      events.push(chunk);
    });

    await streamAgent(
      card,
      'stream',
      { text: 'hello' },
      emit,
      mockFetch as unknown as typeof fetch
    );

    expect(events.length).toBeGreaterThan(0);
    expect(mockFetch).toHaveBeenCalled();
  });

  it('handles errors when skill not found', async () => {
    const emit = mock(() => {});
    await expect(streamAgent(card, 'nonexistent', {}, emit)).rejects.toThrow();
  });
});

describe('fetchAndInvoke', () => {
  it('fetches card and invokes agent', async () => {
    const mockCard: AgentCardWithEntrypoints = {
      name: 'remote-agent',
      version: '1.0.0',
      url: 'https://remote.example.com/',
      skills: [
        {
          id: 'echo',
          name: 'echo',
        },
      ],
      entrypoints: {
        echo: {
          description: 'Echo endpoint',
          streaming: false,
          input_schema: {},
          output_schema: {},
        },
      },
    };

    const mockResponse = {
      run_id: 'test-run',
      status: 'completed',
      output: { text: 'echoed' },
    };

    let callCount = 0;
    const mockFetch = mock(async (url: string | URL | Request) => {
      callCount++;
      const urlStr =
        typeof url === 'string'
          ? url
          : url instanceof URL
            ? url.toString()
            : (url as Request).url;
      if (urlStr.includes('/.well-known/agent-card.json')) {
        return new Response(JSON.stringify(mockCard), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('/entrypoints/echo/invoke')) {
        return new Response(JSON.stringify(mockResponse), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // Return 404 for other URL attempts (fallback paths)
      return new Response('Not Found', { status: 404 });
    });

    const result = await fetchAndInvoke(
      'https://remote.example.com',
      'echo',
      { text: 'hello' },
      mockFetch as unknown as typeof fetch
    );

    expect(result).toBeDefined();
    expect(result.output).toEqual({ text: 'echoed' });
    // fetchAgentCard may try multiple URLs, so we check it was called at least once for card and once for invoke
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  it('handles card fetch errors', async () => {
    const mockFetch = mock(async () => {
      throw new Error('Card fetch failed');
    });

    await expect(
      fetchAndInvoke(
        'https://remote.example.com',
        'echo',
        {},
        mockFetch as unknown as typeof fetch
      )
    ).rejects.toThrow('Card fetch failed');
  });
});

describe('task client route contract', () => {
  const accessToken = 'client-task-access-token-0001';
  const idempotencyKey = 'client-task-idempotency-key-0001';
  const card: AgentCardWithEntrypoints = {
    name: 'path-agent',
    version: '1.0.0',
    url: 'https://agent.example.com/api/agent/',
    skills: [{ id: 'echo', name: 'echo' }],
    entrypoints: {
      echo: { description: 'Echo', streaming: false },
    },
  };

  it('preserves the base path and owner capability for every task operation', async () => {
    const requests: Array<{ url: string; headers: Headers }> = [];
    const mockFetch = mock(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        requests.push({ url, headers: new Headers(init?.headers) });
        if (url.endsWith('/tasks')) {
          if (init?.method === 'POST') {
            return Response.json({
              taskId: 'task-1',
              accessToken,
              status: 'running',
            });
          }
          return Response.json({ tasks: [] });
        }
        if (url.endsWith('/subscribe')) {
          return new Response(
            'event: statusUpdate\ndata: {"taskId":"task-1","status":"running"}\n\n',
            { headers: { 'Content-Type': 'text/event-stream' } }
          );
        }
        return Response.json({
          taskId: 'task-1',
          status: url.endsWith('/cancel') ? 'cancelled' : 'running',
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
        });
      }
    );
    const fetchImpl = mockFetch as unknown as typeof fetch;

    const access = await sendMessage(card, 'echo', {}, fetchImpl, {
      accessToken: `  ${accessToken}  `,
      idempotencyKey,
    });
    await getTask(card, access, fetchImpl);
    await listTasks(card, accessToken, { status: 'running' }, fetchImpl);
    await cancelTask(card, access, fetchImpl);
    await subscribeTask(card, access, () => {}, fetchImpl);

    expect(requests.map(request => request.url)).toEqual([
      'https://agent.example.com/api/agent/tasks',
      'https://agent.example.com/api/agent/tasks/task-1',
      'https://agent.example.com/api/agent/tasks?status=running',
      'https://agent.example.com/api/agent/tasks/task-1/cancel',
      'https://agent.example.com/api/agent/tasks/task-1/subscribe',
    ]);
    expect(
      requests.every(
        request => request.headers.get('Task-Access-Token') === accessToken
      )
    ).toBe(true);
    expect(requests[0]?.headers.get('Idempotency-Key')).toBe(idempotencyKey);
    expect(access.idempotencyKey).toBe(idempotencyKey);
  });

  it('surfaces settlement evidence on a successful task creation', async () => {
    const fetchImpl = mock(async () =>
      Response.json(
        {
          taskId: 'settled-task-1',
          accessToken,
          status: 'running',
        },
        {
          headers: {
            'Payment-Receipt': 'mpp-task-receipt',
            'PAYMENT-RESPONSE': 'x402-task-response',
          },
        }
      )
    ) as unknown as typeof fetch;

    const result = await sendMessage(card, 'echo', {}, fetchImpl, {
      accessToken,
      idempotencyKey,
    });

    expect(result).toEqual({
      taskId: 'settled-task-1',
      accessToken,
      status: 'running',
      idempotencyKey,
      settlement: {
        paymentReceipt: 'mpp-task-receipt',
        paymentResponse: 'x402-task-response',
      },
    });
  });

  it('retains generated recovery keys when the task request is interrupted', async () => {
    let requestHeaders: Headers | undefined;
    const fetchImpl = mock(
      async (_input: string | URL | Request, init?: RequestInit) => {
        requestHeaders = new Headers(init?.headers);
        throw new Error('connection reset');
      }
    ) as unknown as typeof fetch;

    let failure: unknown;
    try {
      await sendMessage(card, 'echo', {}, fetchImpl);
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(TaskCreationError);
    const creationError = failure as TaskCreationError;
    expect(creationError.accessToken.length).toBeGreaterThanOrEqual(20);
    expect(creationError.idempotencyKey.length).toBeGreaterThanOrEqual(20);
    expect(requestHeaders?.get('Task-Access-Token')).toBe(
      creationError.accessToken
    );
    expect(requestHeaders?.get('Idempotency-Key')).toBe(
      creationError.idempotencyKey
    );
    expect((creationError.cause as Error).message).toBe('connection reset');
  });

  it('retains a terminal capability and settlement evidence on non-2xx responses', async () => {
    const fetchImpl = mock(async () =>
      Response.json(
        {
          error: { code: 'task_terminalization_failed' },
          taskId: 'durable-terminal-task',
          accessToken,
          status: 'cancelled',
        },
        {
          status: 503,
          statusText: 'Service Unavailable',
          headers: {
            'Payment-Receipt': 'recoverable-mpp-receipt',
            'X-Payment-Response': 'recoverable-x402-response',
          },
        }
      )
    ) as unknown as typeof fetch;

    let failure: unknown;
    try {
      await sendMessage(card, 'echo', {}, fetchImpl, {
        accessToken,
        idempotencyKey,
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(TaskCreationError);
    const creationError = failure as TaskCreationError;
    expect(creationError.accessToken).toBe(accessToken);
    expect(creationError.idempotencyKey).toBe(idempotencyKey);
    expect(creationError.taskId).toBe('durable-terminal-task');
    expect(creationError.taskStatus).toBe('cancelled');
    expect(creationError.settlement).toEqual({
      paymentReceipt: 'recoverable-mpp-receipt',
      xPaymentResponse: 'recoverable-x402-response',
    });
    expect(creationError.response?.status).toBe(503);
    expect(creationError.responseStatus).toBe(503);
    expect(creationError.body).toMatchObject({
      error: { code: 'task_terminalization_failed' },
      taskId: 'durable-terminal-task',
    });
  });

  it('retains recovery keys when a Fetch returns a disturbed response', async () => {
    const disturbed = Response.json({
      taskId: 'disturbed-task',
      accessToken,
      status: 'running',
    });
    await disturbed.text();
    const fetchImpl = mock(async () => disturbed) as unknown as typeof fetch;

    let failure: unknown;
    try {
      await sendMessage(card, 'echo', {}, fetchImpl, {
        accessToken,
        idempotencyKey,
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(TaskCreationError);
    const creationError = failure as TaskCreationError;
    expect(creationError.accessToken).toBe(accessToken);
    expect(creationError.idempotencyKey).toBe(idempotencyKey);
    expect(creationError.responseStatus).toBe(200);
  });
});

describe('waitForTask', () => {
  it('returns a cancelled task as a terminal result', async () => {
    const task = {
      taskId: 'task-cancelled',
      status: 'cancelled' as const,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    };
    const client = {
      getTask: mock(async () => task),
    } as unknown as A2AClient;
    const card = {
      name: 'task-agent',
      supportedInterfaces: [
        { protocolBinding: 'HTTP+JSON', url: 'https://agent.example/' },
      ],
    };

    await expect(
      waitForTask(
        client,
        card,
        { taskId: task.taskId, accessToken: 'task-access-token-000000001' },
        50
      )
    ).resolves.toEqual(task);
  });
});
