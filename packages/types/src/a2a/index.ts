import type { Network } from '../core/network';
import type { Resource } from '../payments';
import type { SolanaAddress } from '../payments';
import type { RegistrationEntry, TrustModel } from '../identity';
import type { EntrypointDef } from '../core';
import type { Usage } from '../core';
import type { FetchFunction } from '../http';
import type { AP2ExtensionDescriptor } from '../ap2';
import type { AgentMeta, ManifestEntrypoint } from '../core/manifest';

/**
 * Metadata describing an agent.
 * Used for building Agent Cards (A2A protocol) and landing pages (HTTP).
 */
export type Manifest = {
  name: string;
  version: string;
  description?: string;
  entrypoints: Record<string, ManifestEntrypoint>;
};

/**
 * Payment method configuration for x402 protocol.
 */
export type PaymentMethod = {
  method: 'x402' | 'mpp' | (string & {});
  /** Static destination address when known at manifest generation time. */
  payee?: `0x${string}` | SolanaAddress;
  network: Network | string;
  endpoint?: Resource;
  priceModel?: { default?: string };
  extensions?: { [vendor: string]: unknown };
};

/**
 * Agent capabilities and feature flags.
 */
export type AgentCapabilities = {
  streaming?: boolean;
  pushNotifications?: boolean;
  stateTransitionHistory?: boolean;
  extensions?: Array<AP2ExtensionDescriptor | Record<string, unknown>>;
};

/**
 * Agent Interface declaration (protocol binding + URL).
 */
export type AgentInterface = {
  url: string;
  protocolBinding: string;
};

/**
 * Agent Card structure following the Agent Card specification.
 * Describes agent metadata, capabilities, skills, payments, and trust information.
 */
export type AgentCard = {
  /** Protocol version (default: "1.0") */
  protocolVersion?: string;
  name: string;
  description?: string;
  /** @deprecated Use supportedInterfaces instead. */
  url?: string;
  /** Ordered list of supported interfaces (first is preferred) */
  supportedInterfaces?: AgentInterface[];
  provider?: { organization?: string; url?: string };
  version?: string;
  /** Documentation URL */
  documentationUrl?: string;
  capabilities?: AgentCapabilities;
  /** Security schemes map */
  securitySchemes?: Record<string, unknown>;
  /** Security requirements */
  security?: unknown[];
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  skills?: Array<{
    id: string;
    name?: string;
    description?: string;
    tags?: string[];
    examples?: string[];
    inputModes?: string[];
    outputModes?: string[];
    security?: unknown[];
    [key: string]: unknown;
  }>;
  supportsAuthenticatedExtendedCard?: boolean;
  /** JWS signatures for card verification */
  signatures?: Array<{
    protected: string;
    signature: string;
    header?: Record<string, unknown>;
  }>;
  /** Icon URL */
  iconUrl?: string;
  payments?: PaymentMethod[];
  registrations?: RegistrationEntry[];
  trustModels?: TrustModel[];
  ValidationRequestsURI?: string;
  ValidationResponsesURI?: string;
  FeedbackDataURI?: string;
  [key: string]: unknown;
};

/**
 * Agent Card extended with entrypoint definitions from the manifest.
 */
export type AgentCardWithEntrypoints = AgentCard & {
  entrypoints: Manifest['entrypoints'];
};

export type TaskStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export type TaskResult<TOutput = unknown> = {
  output: TOutput;
  usage?: Usage;
  model?: string;
};

export type TaskError = {
  code: string;
  message: string;
  details?: unknown;
};

export type Task<TOutput = unknown> = {
  taskId: string;
  status: TaskStatus;
  result?: TaskResult<TOutput>;
  error?: TaskError;
  contextId?: string;
  createdAt: string;
  updatedAt: string;
};

/** Opaque capability required to read or mutate a task. */
export type TaskAccess = {
  taskId: string;
  accessToken: string;
};

export type ListTasksRequest = {
  contextId?: string;
  status?: TaskStatus | TaskStatus[];
  limit?: number;
  offset?: number;
};

export type ListTasksResponse = {
  tasks: Task[];
  total?: number;
  hasMore?: boolean;
};

export type CancelTaskRequest = {
  taskId: string;
};

export type CancelTaskResponse = Task;

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

export type SendMessageResponse = TaskAccess & {
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

/** Durable task record. Only the token hash is persisted. */
export type StoredTask = {
  task: Task;
  ownerHash: string;
  /** Fenced execution lease. A replacement worker may claim it after expiry. */
  executionLease?: {
    ownerId: string;
    expiresAt: number;
  };
};

/** Atomic persistence port for A2A task state, ownership, and update delivery. */
export type TaskStore = {
  create: (record: StoredTask, event: TaskUpdateEvent) => Promise<void>;
  get: (taskId: string) => Promise<StoredTask | undefined>;
  list: (
    ownerHash: string,
    filters?: ListTasksRequest
  ) => Promise<ListTasksResponse>;
  /** Atomically claim or recover execution of a running task. */
  claimExecution: (
    taskId: string,
    ownerId: string,
    expiresAt: number,
    now: number
  ) => Promise<Task | undefined>;
  compareAndSet: (
    taskId: string,
    expected: TaskStatus[],
    next: Task,
    event: TaskUpdateEvent,
    /** When supplied, reject transitions from a stale execution owner. */
    executionOwnerId?: string
  ) => Promise<Task | undefined>;
  subscribe: (
    taskId: string,
    ownerHash: string,
    listener: (event: TaskUpdateEvent) => void | Promise<void>
  ) => Promise<() => void> | (() => void);
  close?: () => Promise<void> | void;
};

export type StartTaskOptions = {
  taskId: string;
  /** Secret capability. The task runtime persists only its SHA-256 hash. */
  accessToken: string;
  contextId?: string;
  execute: (signal: AbortSignal) => Promise<TaskResult>;
  mapError?: (error: unknown) => TaskError;
};

export type ReserveTaskOptions = Pick<
  StartTaskOptions,
  'taskId' | 'contextId' | 'accessToken'
>;
export type ExecuteTaskOptions = Pick<StartTaskOptions, 'execute' | 'mapError'>;

/** A2A-owned task state machine used by HTTP and other transports. */
export type A2ATaskRuntime = {
  reserve: (options: ReserveTaskOptions) => Promise<Task>;
  execute: (taskId: string, options: ExecuteTaskOptions) => Promise<Task>;
  start: (options: StartTaskOptions) => Promise<Task>;
  get: (taskId: string, accessToken: string) => Promise<Task | undefined>;
  list: (
    accessToken: string,
    filters?: ListTasksRequest
  ) => Promise<ListTasksResponse>;
  cancel: (taskId: string, accessToken: string) => Promise<Task | undefined>;
  subscribe: (
    taskId: string,
    accessToken: string,
    listener: (event: TaskUpdateEvent) => void | Promise<void>
  ) => Promise<() => void> | (() => void);
  close: () => Promise<void>;
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

export type A2AInvokeOptions = {
  /** Stable 20–256 character key reused when a remote invocation is retried. */
  idempotencyKey?: string;
  /** Additional transport headers. */
  headers?: HeadersInit;
};

/**
 * Options for building an Agent Card.
 */
export type BuildAgentCardOptions = {
  meta: AgentMeta;
  registry: Iterable<EntrypointDef>;
  origin: string;
  supportsTasks?: boolean;
};

/**
 * Options for creating A2A runtime.
 */
export type CreateA2ARuntimeOptions = {
  tasks?: {
    store?: TaskStore;
    maxTasks?: number;
    retentionMs?: number;
    maxRunMs?: number;
  };
};

/**
 * A2A client utilities for calling other agents.
 */
export type A2AClient = {
  /**
   * Invokes an agent's entrypoint using the Agent Card.
   */
  invoke: (
    card: AgentCard,
    skillId: string,
    input: unknown,
    fetch?: FetchFunction,
    options?: A2AInvokeOptions
  ) => Promise<InvokeAgentResult>;

  /**
   * Streams from an agent's entrypoint using the Agent Card.
   */
  stream: (
    card: AgentCard,
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
    card: AgentCard,
    skillId: string,
    input: unknown,
    fetch?: FetchFunction,
    options?: {
      contextId?: string;
      metadata?: Record<string, unknown>;
      /** Reuse a capability to group tasks under the same owner. */
      accessToken?: string;
    }
  ) => Promise<SendMessageResponse>;

  /**
   * Gets the status of a task.
   */
  getTask: (
    card: AgentCard,
    access: TaskAccess,
    fetch?: FetchFunction
  ) => Promise<Task>;

  /**
   * Subscribes to task updates via SSE.
   */
  subscribeTask: (
    card: AgentCard,
    access: TaskAccess,
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

  /**
   * Lists tasks with optional filtering.
   */
  listTasks: (
    card: AgentCard,
    accessToken: string,
    filters?: ListTasksRequest,
    fetch?: FetchFunction
  ) => Promise<ListTasksResponse>;

  /**
   * Cancels a running task.
   */
  cancelTask: (
    card: AgentCard,
    access: TaskAccess,
    fetch?: FetchFunction
  ) => Promise<Task>;
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
  fetchCard: (baseUrl: string, fetch?: FetchFunction) => Promise<AgentCard>;

  /**
   * Fetches another agent's Agent Card with entrypoints.
   */
  fetchCardWithEntrypoints: (
    baseUrl: string,
    fetch?: FetchFunction
  ) => Promise<AgentCardWithEntrypoints>;

  /**
   * Client utilities for calling other agents.
   */
  client: A2AClient;

  /** Server-side A2A task state and persistence seam. */
  tasks: A2ATaskRuntime;
};
