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
  A2AInvokeOptions,
  TaskAccess,
  SendMessageOptions,
  TaskSettlementMetadata,
  TaskStatus,
} from '@lucid-agents/types/a2a';

import { fetchAgentCard, findSkill } from './card';

function resolveAgentRoute(baseUrl: string, path: string): URL {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ''), normalizedBase);
}

function resolveAgentBaseUrl(card: AgentCard): string {
  const interfaceUrl = card.supportedInterfaces?.find(agentInterface =>
    agentInterface.protocolBinding.toUpperCase().includes('HTTP')
  )?.url;
  const baseUrl = interfaceUrl ?? card.url;
  if (!baseUrl) {
    throw new Error('Agent Card missing an HTTP interface URL');
  }
  return baseUrl;
}

function normalizeIdempotencyKey(
  value: string | undefined
): string | undefined {
  if (value === undefined) return undefined;
  const key = value.trim();
  if (key.length < 20 || key.length > 256) {
    throw new Error('Idempotency key must contain 20 to 256 characters');
  }
  return key;
}

function normalizeTaskAccessToken(
  value: string | undefined
): string | undefined {
  if (value === undefined) return undefined;
  const token = value.trim();
  if (token.length < 20 || token.length > 256) {
    throw new Error('Task access token must contain 20 to 256 characters');
  }
  return token;
}

const TASK_STATUSES = new Set<TaskStatus>([
  'running',
  'completed',
  'failed',
  'cancelled',
]);

type TaskCreationErrorDetails = {
  accessToken: string;
  idempotencyKey: string;
  cause?: unknown;
  response?: Response;
  body?: unknown;
  taskId?: string;
  taskStatus?: TaskStatus;
  settlement?: TaskSettlementMetadata;
};

/**
 * Recoverable task-creation failure. The capability and idempotency key are
 * always exposed so a caller can inspect/list durable tasks before retrying.
 */
export class TaskCreationError extends Error {
  readonly accessToken: string;
  readonly idempotencyKey: string;
  readonly cause?: unknown;
  readonly response?: Response;
  readonly responseStatus?: number;
  readonly responseStatusText?: string;
  readonly body?: unknown;
  readonly taskId?: string;
  readonly taskStatus?: TaskStatus;
  readonly settlement?: TaskSettlementMetadata;

  constructor(message: string, details: TaskCreationErrorDetails) {
    super(message);
    this.name = 'TaskCreationError';
    this.accessToken = details.accessToken;
    this.idempotencyKey = details.idempotencyKey;
    this.cause = details.cause;
    this.response = details.response;
    this.responseStatus = details.response?.status;
    this.responseStatusText = details.response?.statusText;
    this.body = details.body;
    this.taskId = details.taskId;
    this.taskStatus = details.taskStatus;
    this.settlement = details.settlement;
  }
}

function taskSettlementMetadata(
  response: Response
): TaskSettlementMetadata | undefined {
  const paymentReceipt = response.headers.get('Payment-Receipt') ?? undefined;
  const paymentResponse = response.headers.get('Payment-Response') ?? undefined;
  const xPaymentResponse =
    response.headers.get('X-Payment-Response') ?? undefined;
  if (!paymentReceipt && !paymentResponse && !xPaymentResponse) {
    return undefined;
  }
  return {
    ...(paymentReceipt ? { paymentReceipt } : {}),
    ...(paymentResponse ? { paymentResponse } : {}),
    ...(xPaymentResponse ? { xPaymentResponse } : {}),
  };
}

function taskCreationBody(value: unknown): {
  taskId?: string;
  taskStatus?: TaskStatus;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const taskId =
    typeof record.taskId === 'string' && record.taskId.trim()
      ? record.taskId
      : undefined;
  const taskStatus =
    typeof record.status === 'string' &&
    TASK_STATUSES.has(record.status as TaskStatus)
      ? (record.status as TaskStatus)
      : undefined;
  return {
    ...(taskId ? { taskId } : {}),
    ...(taskStatus ? { taskStatus } : {}),
  };
}

async function readTaskCreationBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * Invokes an agent's entrypoint using the Agent Card.
 */
export async function invokeAgent(
  card: AgentCard,
  skillId: string,
  input: unknown,
  fetchImpl?: FetchFunction,
  options?: A2AInvokeOptions
): Promise<InvokeAgentResult> {
  const skill = findSkill(card, skillId);
  if (!skill) {
    throw new Error(`Skill "${skillId}" not found in Agent Card`);
  }

  const baseUrl = resolveAgentBaseUrl(card);

  const fetchFn = fetchImpl ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error('fetch is not available');
  }

  const url = resolveAgentRoute(baseUrl, `entrypoints/${skillId}/invoke`);
  const headers = new Headers(options?.headers);
  headers.set('Content-Type', 'application/json');
  const idempotencyKey = normalizeIdempotencyKey(options?.idempotencyKey);
  if (idempotencyKey) {
    headers.set('Idempotency-Key', idempotencyKey);
  }
  const response = await fetchFn(url.toString(), {
    method: 'POST',
    headers,
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

  const baseUrl = resolveAgentBaseUrl(card);

  const fetchFn = fetchImpl ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error('fetch is not available');
  }

  const url = resolveAgentRoute(baseUrl, `entrypoints/${skillId}/stream`);
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
  options?: SendMessageOptions
): Promise<SendMessageResponse> {
  const skill = findSkill(card, skillId);
  if (!skill) {
    throw new Error(`Skill "${skillId}" not found in Agent Card`);
  }

  const baseUrl = resolveAgentBaseUrl(card);

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

  const url = resolveAgentRoute(baseUrl, 'tasks');
  const accessToken =
    normalizeTaskAccessToken(options?.accessToken) ??
    globalThis.crypto.randomUUID();
  const idempotencyKey =
    normalizeIdempotencyKey(options?.idempotencyKey) ??
    globalThis.crypto.randomUUID();
  let response: Response;
  try {
    response = await fetchFn(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Task-Access-Token': accessToken,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (cause) {
    throw new TaskCreationError('Task creation request failed', {
      accessToken,
      idempotencyKey,
      cause,
    });
  }

  const settlement = taskSettlementMetadata(response);
  let recoveryResponse: Response;
  try {
    recoveryResponse = response.clone();
  } catch (cause) {
    throw new TaskCreationError(
      'Task creation response could not be inspected',
      {
        accessToken,
        idempotencyKey,
        cause,
        response,
        settlement,
      }
    );
  }
  const body = await readTaskCreationBody(response);
  const capability = taskCreationBody(body);
  if (!response.ok) {
    throw new TaskCreationError(
      `Task creation failed: ${response.status} ${response.statusText}`,
      {
        accessToken,
        idempotencyKey,
        response: recoveryResponse,
        body,
        settlement,
        ...capability,
      }
    );
  }

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    !capability.taskId ||
    !capability.taskStatus
  ) {
    throw new TaskCreationError(
      'Task creation returned an invalid capability response',
      {
        accessToken,
        idempotencyKey,
        response: recoveryResponse,
        body,
        settlement,
        ...capability,
      }
    );
  }
  const result = body as Partial<SendMessageResponse>;
  if (result.accessToken && result.accessToken !== accessToken) {
    throw new TaskCreationError(
      'Task creation returned a mismatched owner capability',
      {
        accessToken,
        idempotencyKey,
        response: recoveryResponse,
        body,
        settlement,
        ...capability,
      }
    );
  }
  return {
    taskId: capability.taskId,
    accessToken,
    status: capability.taskStatus,
    idempotencyKey,
    ...(settlement ? { settlement } : {}),
  };
}

/**
 * Gets the status of a task.
 */
export async function getTask(
  card: AgentCard,
  access: TaskAccess,
  fetchImpl?: FetchFunction
): Promise<Task> {
  const baseUrl = resolveAgentBaseUrl(card);

  const fetchFn = fetchImpl ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error('fetch is not available');
  }

  const url = resolveAgentRoute(baseUrl, `tasks/${access.taskId}`);
  const response = await fetchFn(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Task-Access-Token': access.accessToken,
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
  access: TaskAccess,
  emit: (chunk: TaskUpdateEvent) => Promise<void> | void,
  fetchImpl?: FetchFunction
): Promise<void> {
  const baseUrl = resolveAgentBaseUrl(card);

  const fetchFn = fetchImpl ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error('fetch is not available');
  }

  const url = resolveAgentRoute(baseUrl, `tasks/${access.taskId}/subscribe`);
  const response = await fetchFn(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'text/event-stream',
      'Task-Access-Token': access.accessToken,
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
                taskId: access.taskId,
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
            taskId: access.taskId,
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
  fetchImpl?: FetchFunction,
  options?: SendMessageOptions
): Promise<SendMessageResponse> {
  const card = await fetchAgentCard(baseUrl, fetchImpl);
  return sendMessage(card, skillId, input, fetchImpl, options);
}

/**
 * Lists tasks with optional filtering.
 */
export async function listTasks(
  card: AgentCard,
  accessToken: string,
  filters?: ListTasksRequest,
  fetchImpl?: FetchFunction
): Promise<ListTasksResponse> {
  const baseUrl = resolveAgentBaseUrl(card);

  const fetchFn = fetchImpl ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error('fetch is not available');
  }

  const url = resolveAgentRoute(baseUrl, 'tasks');
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
    headers: {
      'Content-Type': 'application/json',
      'Task-Access-Token': accessToken,
    },
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
  access: TaskAccess,
  fetchImpl?: FetchFunction
): Promise<Task> {
  const baseUrl = resolveAgentBaseUrl(card);

  const fetchFn = fetchImpl ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error('fetch is not available');
  }

  const url = resolveAgentRoute(baseUrl, `tasks/${access.taskId}/cancel`);
  const response = await fetchFn(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Task-Access-Token': access.accessToken,
    },
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
 * Polls task status until it reaches any terminal state.
 */
export async function waitForTask<TOutput = unknown>(
  client: A2AClient,
  card: AgentCard,
  access: TaskAccess,
  maxWaitMs = 30000
): Promise<Task<TOutput>> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const task = await client.getTask(card, access);
    if (
      task.status === 'completed' ||
      task.status === 'failed' ||
      task.status === 'cancelled'
    ) {
      return task as Task<TOutput>;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(
    `Task ${access.taskId} did not complete within ${maxWaitMs}ms`
  );
}
