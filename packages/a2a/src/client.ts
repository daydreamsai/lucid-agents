import type { FetchFunction } from '@lucid-agents/types/http';
import type { AgentCard } from '@lucid-agents/types/a2a';
import type {
  InvokeAgentResult,
  StreamEmit,
  SendMessageRequest,
  SendMessageResponse,
  Task,
  TaskUpdateEvent,
  A2AClient,
  ListTasksRequest,
  ListTasksResponse,
  CancelTaskRequest,
  CancelTaskResponse,
} from '@lucid-agents/types/a2a';

import { fetchAgentCard, findSkill } from './card';

/**
 * Invokes an agent's entrypoint using the Agent Card.
 */
export async function invokeAgent(
  card: AgentCard,
  skillId: string,
  input: unknown,
  fetchImpl?: FetchFunction
): Promise<InvokeAgentResult> {
  const skill = findSkill(card, skillId);
  if (!skill) {
    throw new Error(`Skill "${skillId}" not found in Agent Card`);
  }

  const baseUrl = card.url;
  if (!baseUrl) {
    throw new Error('Agent Card missing url field');
  }

  const fetchFn = fetchImpl ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error('fetch is not available');
  }

  const url = new URL(`/entrypoints/${skillId}/invoke`, baseUrl);
  const response = await fetchFn(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input }),
  });

  if (!response.ok) {
    throw new Error(
      `Agent invocation failed: ${response.status} ${response.statusText}`
    );
  }

  return (await response.json()) as InvokeAgentResult;
}

/**
 * Streams from an agent's entrypoint using the Agent Card.
 */
export async function streamAgent(
  card: AgentCard,
  skillId: string,
  input: unknown,
  emit: StreamEmit,
  fetchImpl?: FetchFunction
): Promise<void> {
  const skill = findSkill(card, skillId);
  if (!skill) {
    throw new Error(`Skill "${skillId}" not found in Agent Card`);
  }

  const baseUrl = card.url;
  if (!baseUrl) {
    throw new Error('Agent Card missing url field');
  }

  const fetchFn = fetchImpl ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error('fetch is not available');
  }

  const url = new URL(`/entrypoints/${skillId}/stream`, baseUrl);
  const response = await fetchFn(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input }),
  });

  if (!response.ok) {
    throw new Error(
      `Agent stream failed: ${response.status} ${response.statusText}`
    );
  }

  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent: { type: string; data: string } | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = {
            type: line.slice(7).trim(),
            data: '',
          };
        } else if (line.startsWith('data: ')) {
          if (currentEvent) {
            currentEvent.data +=
              (currentEvent.data ? '\n' : '') + line.slice(6);
          }
        } else if (line === '' && currentEvent) {
          try {
            const data = currentEvent.data ? JSON.parse(currentEvent.data) : {};
            await emit({ type: currentEvent.type, data });
          } catch (error) {
            // Ignore JSON parse errors for non-JSON data
            await emit({ type: currentEvent.type, data: currentEvent.data });
          }
          currentEvent = null;
        }
      }
    }

    // Handle remaining buffer
    if (buffer.trim() && currentEvent) {
      try {
        const data = currentEvent.data ? JSON.parse(currentEvent.data) : {};
        await emit({ type: currentEvent.type, data });
      } catch {
        await emit({ type: currentEvent.type, data: currentEvent.data });
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Convenience function that fetches an Agent Card and invokes an entrypoint.
 */
export async function fetchAndInvoke(
  baseUrl: string,
  skillId: string,
  input: unknown,
  fetchImpl?: FetchFunction
): Promise<InvokeAgentResult> {
  const card = await fetchAgentCard(baseUrl, fetchImpl);
  return invokeAgent(card, skillId, input, fetchImpl);
}

/**
 * Sends a message to an agent using A2A task-based operations.
 * Creates a task and returns the taskId immediately.
 */
export async function sendMessage(
  card: AgentCard,
  skillId: string,
  input: unknown,
  fetchImpl?: FetchFunction,
  options?: { contextId?: string; metadata?: Record<string, unknown> }
): Promise<SendMessageResponse> {
  const skill = findSkill(card, skillId);
  if (!skill) {
    throw new Error(`Skill "${skillId}" not found in Agent Card`);
  }

  const baseUrl = card.url;
  if (!baseUrl) {
    throw new Error('Agent Card missing url field');
  }

  const fetchFn = fetchImpl ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error('fetch is not available');
  }

  // Construct A2A SendMessageRequest format
  const messageContent: SendMessageRequest['message']['content'] = {
    text: typeof input === 'string' ? input : JSON.stringify(input),
  };

  const requestBody: SendMessageRequest = {
    message: {
      role: 'user',
      content: messageContent,
    },
    skillId,
    contextId: options?.contextId,
    metadata: options?.metadata,
  };

  const url = new URL('/tasks', baseUrl);
  const response = await fetchFn(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(
      `Task creation failed: ${response.status} ${response.statusText}`
    );
  }

  return (await response.json()) as SendMessageResponse;
}

/**
 * Gets the status of a task.
 */
export async function getTask(
  card: AgentCard,
  taskId: string,
  fetchImpl?: FetchFunction
): Promise<Task> {
  const baseUrl = card.url;
  if (!baseUrl) {
    throw new Error('Agent Card missing url field');
  }

  const fetchFn = fetchImpl ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error('fetch is not available');
  }

  const url = new URL(`/tasks/${taskId}`, baseUrl);
  const response = await fetchFn(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to get task: ${response.status} ${response.statusText}`
    );
  }

  return (await response.json()) as Task;
}

/**
 * Subscribes to task updates via SSE.
 */
export async function subscribeTask(
  card: AgentCard,
  taskId: string,
  emit: (chunk: TaskUpdateEvent) => Promise<void> | void,
  fetchImpl?: FetchFunction
): Promise<void> {
  const baseUrl = card.url;
  if (!baseUrl) {
    throw new Error('Agent Card missing url field');
  }

  const fetchFn = fetchImpl ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error('fetch is not available');
  }

  const url = new URL(`/tasks/${taskId}/subscribe`, baseUrl);
  const response = await fetchFn(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'text/event-stream',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to subscribe to task: ${response.status} ${response.statusText}`
    );
  }

  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent: { type: string; data: string } | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = {
            type: line.slice(7).trim(),
            data: '',
          };
        } else if (line.startsWith('data: ')) {
          if (currentEvent) {
            currentEvent.data +=
              (currentEvent.data ? '\n' : '') + line.slice(6);
          }
        } else if (line === '' && currentEvent) {
          try {
            const data = currentEvent.data ? JSON.parse(currentEvent.data) : {};
            await emit({ type: currentEvent.type, data } as TaskUpdateEvent);
          } catch (error) {
            // Ignore JSON parse errors for non-JSON data
            await emit({
              type: currentEvent.type,
              data: {
                taskId,
                error: {
                  code: 'parse_error',
                  message: currentEvent.data || 'Failed to parse event data',
                },
              },
            } as TaskUpdateEvent);
          }
          currentEvent = null;
        }
      }
    }

    // Handle remaining buffer
    if (buffer.trim() && currentEvent) {
      try {
        const data = currentEvent.data ? JSON.parse(currentEvent.data) : {};
        await emit({ type: currentEvent.type, data } as TaskUpdateEvent);
      } catch {
        await emit({
          type: currentEvent.type,
          data: {
            taskId,
            error: {
              code: 'parse_error',
              message: currentEvent.data || 'Failed to parse event data',
            },
          },
        } as TaskUpdateEvent);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Convenience function that fetches an Agent Card and sends a message.
 */
export async function fetchAndSendMessage(
  baseUrl: string,
  skillId: string,
  input: unknown,
  fetchImpl?: FetchFunction
): Promise<SendMessageResponse> {
  const card = await fetchAgentCard(baseUrl, fetchImpl);
  return sendMessage(card, skillId, input, fetchImpl);
}

/**
 * Lists tasks with optional filtering.
 */
export async function listTasks(
  card: AgentCard,
  filters?: ListTasksRequest,
  fetchImpl?: FetchFunction
): Promise<ListTasksResponse> {
  const baseUrl = card.url;
  if (!baseUrl) {
    throw new Error('Agent Card missing url field');
  }

  const fetchFn = fetchImpl ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error('fetch is not available');
  }

  const url = new URL('/tasks', baseUrl);
  if (filters?.contextId) url.searchParams.set('contextId', filters.contextId);
  if (filters?.status) {
    const statusArray = Array.isArray(filters.status)
      ? filters.status
      : [filters.status];
    url.searchParams.set('status', statusArray.join(','));
  }
  if (filters?.limit) url.searchParams.set('limit', String(filters.limit));
  if (filters?.offset) url.searchParams.set('offset', String(filters.offset));

  const response = await fetchFn(url.toString(), {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to list tasks: ${response.status} ${response.statusText}`
    );
  }

  return (await response.json()) as ListTasksResponse;
}

/**
 * Cancels a running task.
 */
export async function cancelTask(
  card: AgentCard,
  taskId: string,
  fetchImpl?: FetchFunction
): Promise<Task> {
  const baseUrl = card.url;
  if (!baseUrl) {
    throw new Error('Agent Card missing url field');
  }

  const fetchFn = fetchImpl ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error('fetch is not available');
  }

  const url = new URL(`/tasks/${taskId}/cancel`, baseUrl);
  const response = await fetchFn(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to cancel task: ${response.status} ${response.statusText}`
    );
  }

  return (await response.json()) as Task;
}

/**
 * Helper function to wait for a task to complete.
 * Polls task status until it's completed or failed.
 */
export async function waitForTask<TOutput = unknown>(
  client: A2AClient,
  card: AgentCard,
  taskId: string,
  maxWaitMs = 30000
): Promise<Task<TOutput>> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const task = await client.getTask(card, taskId);
    if (task.status === 'completed' || task.status === 'failed') {
      return task as Task<TOutput>;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Task ${taskId} did not complete within ${maxWaitMs}ms`);
}
