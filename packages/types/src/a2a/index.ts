import type {
  AgentCardWithEntrypoints,
  FetchFunction,
  AgentMeta,
  EntrypointDef,
} from '../core';
import type { AgentRuntime } from '../core';
import type { Usage } from '../core';

export type TaskStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export type TaskResult = {
  output: unknown;
  usage?: Usage;
  model?: string;
};

export type TaskError = {
  code: string;
  message: string;
  details?: unknown;
};

export type Task = {
  taskId: string;
  status: TaskStatus;
  result?: TaskResult;
  error?: TaskError;
  createdAt: string;
  updatedAt: string;
};

export type MessageContent =
  | { text: string }
  | { parts: Array<{ text?: string; [key: string]: unknown }> };

export type SendMessageRequest = {
  message: {
    role: 'user' | 'assistant' | 'system';
    content: MessageContent;
  };
  skillId: string;
  contextId?: string;
  metadata?: Record<string, unknown>;
};

export type SendMessageResponse = {
  taskId: string;
  status: 'running';
};

export type GetTaskResponse = Task;

export type TaskUpdateEvent = {
  type: 'statusUpdate' | 'resultUpdate' | 'error';
  data: {
    taskId: string;
    status?: TaskStatus;
    result?: TaskResult;
    error?: TaskError;
  };
};

/**
 * Result from invoking an agent entrypoint.
 */
export type InvokeAgentResult = {
  run_id?: string;
  status: string;
  output?: unknown;
  usage?: unknown;
  model?: string;
};

/**
 * Emit function for streaming agent responses.
 */
export type StreamEmit = (chunk: {
  type: string;
  data: unknown;
}) => Promise<void> | void;

/**
 * Options for building an Agent Card.
 */
export type BuildAgentCardOptions = {
  meta: AgentMeta;
  registry: Iterable<EntrypointDef>;
  origin: string;
};

/**
 * Options for creating A2A runtime.
 */
export type CreateA2ARuntimeOptions = {
  // Future: could add options here
};

/**
 * A2A client utilities for calling other agents.
 */
export type A2AClient = {
  /**
   * Invokes an agent's entrypoint using the Agent Card.
   */
  invoke: (
    card: AgentCardWithEntrypoints,
    skillId: string,
    input: unknown,
    fetch?: FetchFunction
  ) => Promise<InvokeAgentResult>;

  /**
   * Streams from an agent's entrypoint using the Agent Card.
   */
  stream: (
    card: AgentCardWithEntrypoints,
    skillId: string,
    input: unknown,
    emit: StreamEmit,
    fetch?: FetchFunction
  ) => Promise<void>;

  /**
   * Convenience function that fetches an Agent Card and invokes an entrypoint.
   */
  fetchAndInvoke: (
    baseUrl: string,
    skillId: string,
    input: unknown,
    fetch?: FetchFunction
  ) => Promise<InvokeAgentResult>;

  /**
   * Sends a message to an agent using A2A task-based operations.
   * Creates a task and returns the taskId immediately.
   */
  sendMessage: (
    card: AgentCardWithEntrypoints,
    skillId: string,
    input: unknown,
    fetch?: FetchFunction
  ) => Promise<SendMessageResponse>;

  /**
   * Gets the status of a task.
   */
  getTask: (
    card: AgentCardWithEntrypoints,
    taskId: string,
    fetch?: FetchFunction
  ) => Promise<Task>;

  /**
   * Subscribes to task updates via SSE.
   */
  subscribeTask: (
    card: AgentCardWithEntrypoints,
    taskId: string,
    emit: (chunk: TaskUpdateEvent) => Promise<void> | void,
    fetch?: FetchFunction
  ) => Promise<void>;

  /**
   * Convenience function that fetches an Agent Card and sends a message.
   */
  fetchAndSendMessage: (
    baseUrl: string,
    skillId: string,
    input: unknown,
    fetch?: FetchFunction
  ) => Promise<SendMessageResponse>;
};

/**
 * A2A runtime type.
 * Returned by AgentRuntime.a2a when A2A is configured.
 */
export type A2ARuntime = {
  /**
   * Builds base Agent Card (A2A protocol only, no payments/identity/AP2).
   */
  buildCard: (origin: string) => AgentCardWithEntrypoints;

  /**
   * Fetches another agent's Agent Card.
   */
  fetchCard: (
    baseUrl: string,
    fetch?: FetchFunction
  ) => Promise<AgentCardWithEntrypoints>;

  /**
   * Client utilities for calling other agents.
   */
  client: A2AClient;
};
