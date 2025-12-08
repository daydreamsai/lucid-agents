import type { Network, Resource } from 'x402/types';
import type { EntrypointPrice, SolanaAddress } from '../payments';
import type { RegistrationEntry, TrustModel } from '../identity';
import type { EntrypointDef } from '../core';
import type { AgentRuntime } from '../core';
import type { Usage } from '../core';
import type { FetchFunction } from '../http';
import type { AP2ExtensionDescriptor } from '../ap2';

/**
 * Metadata describing an agent.
 * Used for building Agent Cards (A2A protocol) and landing pages (HTTP).
 */
export type AgentMeta = {
  name: string;
  version: string;
  description?: string;
  icon?: string;
  /**
   * Open Graph image URL for social previews and x402scan discovery.
   * Should be an absolute URL (e.g., "https://agent.com/og-image.png").
   * Recommended size: 1200x630px.
   */
  image?: string;
  /**
   * Canonical URL of the agent. Used for Open Graph tags.
   * If not provided, defaults to the agent's origin URL.
   */
  url?: string;
  /**
   * Open Graph type. Defaults to "website".
   */
  type?: 'website' | 'article';
};

/**
 * Agent manifest structure describing entrypoints and capabilities.
 */
export type Manifest = {
  name: string;
  version: string;
  description?: string;
  entrypoints: Record<
    string,
    {
      description?: string;
      streaming: boolean;
      input_schema?: any;
      output_schema?: any;
      pricing?: { invoke?: string; stream?: string };
    }
  >;
};

/**
 * Payment method configuration for x402 protocol.
 */
export type PaymentMethod = {
  method: 'x402';
  payee: `0x${string}` | SolanaAddress;
  network: Network;
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
  extensions?: Array<
    AP2ExtensionDescriptor | Record<string, unknown>
  >;
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
  /** DEPRECATED: Use supportedInterfaces instead */
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
    card: AgentCard,
    skillId: string,
    input: unknown,
    fetch?: FetchFunction
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
    options?: { contextId?: string; metadata?: Record<string, unknown> }
  ) => Promise<SendMessageResponse>;

  /**
   * Gets the status of a task.
   */
  getTask: (
    card: AgentCard,
    taskId: string,
    fetch?: FetchFunction
  ) => Promise<Task>;

  /**
   * Subscribes to task updates via SSE.
   */
  subscribeTask: (
    card: AgentCard,
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

  /**
   * Lists tasks with optional filtering.
   */
  listTasks: (
    card: AgentCard,
    filters?: ListTasksRequest,
    fetch?: FetchFunction
  ) => Promise<ListTasksResponse>;

  /**
   * Cancels a running task.
   */
  cancelTask: (
    card: AgentCard,
    taskId: string,
    fetch?: FetchFunction
  ) => Promise<Task>;
};

/**
 * Manifest runtime type.
 * Returned by AgentRuntime.manifest.
 */
export type ManifestRuntime = {
  build: (origin: string) => AgentCardWithEntrypoints;
  invalidate: () => void;
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
};
